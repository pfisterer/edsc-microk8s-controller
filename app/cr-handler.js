module.exports = class CrHandler {
	constructor(options) {
		this.logger = options.getLogger("CrHandler")

		this.requiredSpecFields = ["openstack_username", "openstack_auth_url", "openstack_password", "openstack_domain_name", "openstack_project", "openstack_user_domain_name", "node_name", "image", "flavor", "security_group", "key_name", "external_network_name", "floating_ip_pool", "dns_server1", "dns_server2", "microk8s_version", "enable_nginx"]

		this.requiredStatusFields = []
	}

	checkFieldsExist(fields, object) {
		for (const field of fields) {
			if (!object[field]) {
				this.logger.debug(`checkFieldsExist: Field ${field} missing in `, object)
				return false
			}
		}
		return true
	}

	async isValidSpec(spec) {
		if (!spec) {
			this.logger.debug(`isValidSpec: spec is null`)
			return false;
		}

		//TODO ensure that field contains valid entries only to avoid injection

		return this.checkFieldsExist(this.requiredSpecFields, spec)
	}

	async isValidStatus(status) {
		if (!status) {
			this.logger.debug(`isValidStatus: status is null`)
			return false;
		}
		return this.checkFieldsExist(this.requiredStatusFields, status)
	}

	async getKey(spec) {
		if (!this.isValidSpec(spec))
			return null;
		return "microk8s-" + spec.openstack_username + "-" + spec.node_name;
	}

	async getExistingResources() {
		// return map(key, object)
		return null;
	}

	async handleReconcileStart() {
		this.logger.debug(`handleReconcileStart`)
	}

	async handleReconcileEnd() {
		this.logger.debug(`handleReconcileEnd`)
	}

	async handleDeleteResource(key, customResource, resource) {
		this.logger.debug(`handleDeleteResource, key =`, key, `customResource = `, customResource, `resource = `, resource)
	}

	async handleCreateOrUpdateResource(key, customResource, resource) {
		this.logger.debug(`handleCreateOrUpdateResource, key =`, key, `customResource = `, customResource, `resource = `, resource)
	}

}
