
module.exports = class CrHandler {
	constructor(options) {
		this.logger = options.getLogger("DummyHandler")
		this.options = options
	}

	//invoked by the reconciler and provides a function(key, statusPatch) which can be 
	//called to set the status of a pod
	setSetStatusFunction(statusFunction) {
		this.statusFunction = statusFunction
	}

	async isValidSpec(spec) {
		return true
	}

	async isValidStatus(status) {
		return true
	}

	async getExistingResources() {
		// return map(key, object)
		return null;
	}

	async handleReconcileStart() {
		//this.logger.debug(`handleReconcileStart`)
	}

	async handleReconcileEnd() {
		//this.logger.debug(`handleReconcileEnd`)
	}

	async handleDeleteResource(key, customResource, resource) {
		this.logger.debug(`handleDeleteResource, key =`, key)
		this.statusFunction(key, { "controller_status": `Created new Ansible pod instance ${key} to delete existing resources.` })
	}

	async handleCreateOrUpdateResource(key, customResource, resource) {
		this.logger.debug(`handleCreateOrUpdateResource, key =`, key)
		this.statusFunction(key, { "controller_status": `Created new Ansible pod instance ${key}` })
	}

}
