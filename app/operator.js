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
		this.logger.debug("Starting operator")
		await this.k8s.registerCrd(yaml.load(fs.readFileSync(this.options.crdFile, 'utf8')))
		this.informer = this.createInformer()
		await this.handler.start(this.informer, this.k8s.crdApiClient, this.k8s.crdDefinition(), this)

		return new Promise((resolve, reject) => {
			this.resolvePromise = resolve;
			this.rejectPromise = reject;
		})
	}

	async stop() {
		await this.handler.stop()
		this.resolvePromise()
	}

	k8sHelper() {
		return this.k8s
	}

	createInformer() {
		//Generate API path
		let apiPaths = `/apis/${this.k8sHelper().crdDefinition().group}/${this.k8sHelper().crdDefinition().versions[0].name}/namespaces/${this.options.namespace}/${this.k8sHelper().crdDefinition().plural}`;

		//Create Informer and add callbacks
		const listFunction = () => {
			return this.k8s.customObjectsApi()
				.listNamespacedCustomObject(this.k8sHelper().crdDefinition().group, this.k8sHelper().crdDefinition().versions[0].name, this.options.namespace, this.k8sHelper().crdDefinition().plural)
		}
		const informer = this.k8s.k8s().makeInformer(this.k8s.config(), apiPaths, listFunction)

		informer.on('add', async (obj) => {
			try {
				this.handler.added(obj, informer, this.k8sHelper().crdApiClient, this.k8sHelper().crdDefinition())
			} catch (error) {
				this.logger.error("on:add: Error in handler", error)
			}
		})

		informer.on('update', async (obj) => {
			try {
				this.handler.updated(obj, informer, this.k8sHelper().crdApiClient, this.k8sHelper().crdDefinition())
			} catch (error) {
				this.logger.error("on:update: Error in handler", error)
			}
		})

		informer.on('delete', async (obj) => {
			try {
				this.handler.deleted(obj, informer, this.k8sHelper().crdApiClient, this.k8sHelper().crdDefinition())
			} catch (error) {
				this.logger.error("on:delete: Error in handler", error)
			}
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

}