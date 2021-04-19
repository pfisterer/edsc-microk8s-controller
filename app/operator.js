const fs = require('fs')
const yaml = require('js-yaml')
const K8sHelper = require('./k8s-helper')

module.exports = class Operator {
	constructor(options, handler) {
		this.logger = options.getLogger("Operator")
		this.options = options
		this.handler = handler
		this.restartPeriod = 5000;
		this.k8s = new K8sHelper(options);
	}

	async run() {
		this.crd = await this.register(yaml.load(fs.readFileSync(this.options.crdFile, 'utf8')));
		this.informer = this.createInformer()
		await this.handler.start(this.informer, this.crdApiClient, this.crd, this)

		return new Promise((resolve, reject) => {
			this.resolvePromise = resolve;
			this.rejectPromise = reject;
		})
	}

	async stop() {
		await this.handler.stop()
		this.resolvePromise()
	}

	async crExists(name) {
		try {
			let result = await this.k8s.customObjectsApi()
				.getNamespacedCustomObject(this.crd.group, this.crd.versions[0].name, this.options.namespace, this.crd.plural, name)

			return result.response.statusCode == 200;
		} catch (error) {
			return false
		}
	}


	async patchCrStatus(crName, statusPatch) {
		this.logger.debug(`Patching status of CR ${crName} with status: `, statusPatch)

		const patch = [
			{
				"op": "replace",
				"path": "/status",
				"value": statusPatch
			}
		];
		const options = { "headers": { "Content-type": this.k8s.k8s().PatchUtils.PATCH_FORMAT_JSON_PATCH } };

		// public async patchNamespacedCustomObjectStatus (group: string, version: string, namespace: string, plural: string, name: string, body: object, dryRun?: string, fieldManager?: string, force?: boolean, options: {headers: {[name: string]: string}} = {headers: {}}) : Promise<{ response: http.IncomingMessage; body: object;  }> {...}
		return this.k8s.customObjectsApi().patchNamespacedCustomObjectStatus(
			/*group*/ this.crd.group, /* version */ this.crd.versions[0].name, /* namespace */ this.options.namespace, /* plural */ this.crd.plural,
			/* name */crName, /* body */ patch,	/* dryRun */ undefined,
			/* fieldManager */ undefined, /* force */ undefined,
			/* options */ options
		)
	}

	createInformer() {
		//Generate API path
		let apiPaths = `/apis/${this.crd.group}/${this.crd.versions[0].name}/namespaces/${this.options.namespace}/${this.crd.plural}`;

		//Create Informer and add callbacks
		const listFunction = () => {
			return this.k8s.customObjectsApi().listNamespacedCustomObject(this.crd.group, this.crd.versions[0].name, this.options.namespace, this.crd.plural)
		}
		const informer = this.k8s.k8s().makeInformer(this.k8s.config(), apiPaths, listFunction)

		informer.on('add', async (obj) => {
			this.handler.added(obj, informer, this.crdApiClient, this.crd)
		})

		informer.on('update', async (obj) => {
			this.handler.updated(obj, informer, this.crdApiClient, this.crd)
		})

		informer.on('delete', async (obj) => {
			this.handler.deleted(obj, informer, this.crdApiClient, this.crd)
		})

		//Restart informer on error
		informer.on('error', (err) => {
			this.logger.error(`Informer returned error, restarting in ${this.restartPeriod}ms, err=`, err)

			setTimeout(() => {
				this.logger.info("Restarting informer after error.")
				informer.start()
			}, this.restartPeriod)
		})

		return informer.start()
	}

	async register(crd) {

		try {
			const apiVersion = crd['apiVersion']

			if (!apiVersion.startsWith('apiextensions.k8s.io/')) {
				throw new Error("Invalid CRD kind (expected 'apiextensions.k8s.io')");
			}

			if (apiVersion === 'apiextensions.k8s.io/v1beta1') {
				this.crdApiClient = this.k8s.config().makeApiClient(this.k8s.k8s().ApiextensionsV1beta1Api)
			} else {
				this.crdApiClient = await this.kubeConfig.makeApiClient(this.k8s.k8s().ApiextensionsV1Api)
			}

			await this.crdApiClient.createCustomResourceDefinition(crd);

			this.logger.info(`Registered custom resource definition '${crd.metadata.name}'`);

		} catch (err) {

			// API returns a 409 Conflict if CRD already exists.
			if (err?.response?.statusCode !== 409) {
				console.log("Error:", err)
				throw err;
			}
		}

		return {
			group: crd.spec.group,
			versions: crd.spec.versions,
			plural: crd.spec.names.plural,
		}
	}

}