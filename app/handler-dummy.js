module.exports = class DummyHandler {
	constructor(options) {
		this.logger = options.getLogger("DummyHandler")
		this.options = options
	}

	async start(informer, crApi, crd, operator) { }
	async stop() { }

	async added(cr) { }
	async updated(cr) { }
	async deleted(cr) { }
}