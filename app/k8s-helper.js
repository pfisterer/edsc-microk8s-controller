const k8s = require('@kubernetes/client-node');

module.exports = class K8sHelper {
	constructor(options) {
		this.logger = options.getLogger("K8sHelper")
		this.options = options
	}

	config() {
		const kubeConfig = new k8s.KubeConfig()
		kubeConfig.loadFromDefault();
		return kubeConfig
	}

	k8s() {
		return k8s
	}

	coreApi() {
		return this.config().makeApiClient(k8s.CoreV1Api)
	}

	customObjectsApi() {
		return this.config().makeApiClient(k8s.CustomObjectsApi)
	}

	batchApi() {
		// https://github.com/kubernetes-client/javascript/blob/master/src/gen/api/batchV1Api.ts
		return this.config().makeApiClient(k8s.BatchV1Api)
	}

	attachApi() {
		return new k8s.Attach(this.config())
	}

	//---------------------------------------------------------
	// Pod handling
	//---------------------------------------------------------

	async createPod(pod) {
		const yamlString = k8s.loadYaml(k8s.dumpYaml(pod))
		this.logger.debug("Creating pod with spec: ", yamlString)
		return this.coreApi().createNamespacedPod(this.options.namespace, pod)
	}

	// cf. https://github.com/kubernetes-client/javascript/blob/master/examples/typescript/attach/attach-example.ts
	async attachToPod(name, stdoutStream, stderrStream) {
		const attach = new k8s.Attach(this.config());
		attach.attach(this.options.namespace, key, stdoutStream, stderrStream, null /* stdin */, false /* tty */)
	}

	async getPod(name) {
		let result = await this.coreApi().readNamespacedPod(name, this.options.namespace)

		if (result.response.statusCode == 200) {
			return result.body
		}

		throw result.body.response.body
	}

	async podExists(name) {
		try {
			let result = await this.coreApi().readNamespacedPod(name, this.options.namespace)
			return result.response.statusCode == 200;
		} catch {
			return false
		}
	}

	async deletePod(name) {
		return await this.coreApi().deleteNamespacedPod(name, this.options.namespace)
	}

	async getPods(labelSelectors, fieldSelectors) {
		//TODO Evaluate _continue: field
		const pods = await this.coreApi().listNamespacedPod(this.options.namespace, null, null, null, fieldSelectors, labelSelectors)
		return pods.body.items
	}

	//---------------------------------------------------------
	// Custom Resources
	//---------------------------------------------------------

	crdDefinition() {
		return this.crd
	}

	async registerCrd(crd) {
		this.logger.info(`registerCrd: Trying to register custom resource definition`);

		try {
			const apiVersion = crd['apiVersion']

			if (!apiVersion.startsWith('apiextensions.k8s.io/')) {
				const msg = "registerCrd: Invalid CRD kind (expected 'apiextensions.k8s.io')"
				this.logger.error(msg);
				throw new Error(msg);
			}

			if (apiVersion === 'apiextensions.k8s.io/v1beta1') {
				this.crdApiClient = this.config().makeApiClient(k8s.ApiextensionsV1beta1Api)
			} else {
				this.crdApiClient = await this.config().makeApiClient(k8s.ApiextensionsV1Api)
			}

			await this.crdApiClient.createCustomResourceDefinition(crd);

			this.logger.info(`registerCrd: Registered custom resource definition '${crd.metadata.name}'`);

		} catch (err) {
			this.logger.info(`registerCrd: Already registered.`);

			// API returns a 409 Conflict if CRD already exists.
			if (err?.response?.statusCode !== 409) {
				this.logger.error("registerCrd: Error:", err)
				throw err;
			}
		}

		this.crd = {
			group: crd.spec.group,
			versions: crd.spec.versions,
			plural: crd.spec.names.plural,
		}
		this.logger.debug(`registerCrd: Done, this.crd = `, this.crd);
	}

	async crExists(name) {
		try {
			let result = await this.customObjectsApi()
				.getNamespacedCustomObject(this.crd.group, this.crd.versions[0].name, this.options.namespace, this.crd.plural, name)

			return result.response.statusCode == 200;
		} catch (error) {
			return false
		}
	}

	async listCrs() {
		return (
			await this.customObjectsApi().listNamespacedCustomObject(
				this.crd.group, this.crd.versions[0].name, this.options.namespace, this.crd.plural
			)
		)?.body?.items;
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
		const options = { "headers": { "Content-type": k8s.PatchUtils.PATCH_FORMAT_JSON_PATCH } };

		// public async patchNamespacedCustomObjectStatus (group: string, version: string, namespace: string, plural: string, name: string, body: object, dryRun?: string, fieldManager?: string, force?: boolean, options: {headers: {[name: string]: string}} = {headers: {}}) : Promise<{ response: http.IncomingMessage; body: object;  }> {...}
		return this.customObjectsApi().patchNamespacedCustomObjectStatus(
			/*group*/ this.crd.group, /* version */ this.crd.versions[0].name, /* namespace */ this.options.namespace, /* plural */ this.crd.plural,
			/* name */crName, /* body */ patch,	/* dryRun */ undefined,
			/* fieldManager */ undefined, /* force */ undefined,
			/* options */ options
		)
	}



}

