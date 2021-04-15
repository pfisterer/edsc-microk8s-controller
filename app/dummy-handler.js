module.exports = class DummyHandler {
	constructor(options) {
		this.logger = options.getLogger("DummyHandler")
		this.options = options
	}

	async start(informer, crApi, crd) { }
	async stop() { }
	async added(cr, informer, crApi, crd) { }
	async updated(cr, informer, crApi, crd) { }
	async deleted(cr, informer, crApi, crd) { }

}