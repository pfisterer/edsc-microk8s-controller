const PodRunner = require('./pod-runner')
const express = require('express')
const { addAsync } = require('@awaitjs/express');

const mk8sToEnvMapping = new Map([
	["openstack_username", 'OS_USERNAME'],
	["openstack_auth_url", 'OS_AUTH_URL'],
	["openstack_password", 'OS_PASSWORD'],
	["openstack_domain_name", 'OS_DOMAIN_NAME'],
	["openstack_project", 'OS_PROJECT_NAME'],
	["openstack_user_domain_name", 'OS_USER_DOMAIN_NAME'],
	["image", 'IMAGE'],
	["flavor", 'NODE_FLAVOR'],
	["security_group", 'NODE_SEC_GROUP'],
	["key_name", 'KEY'],
	["external_network_name", 'EXT_NET'],
	["floating_ip_pool", 'FLOATING_IP_POOL'],
	["dns_server1", 'DNS_SERVER_1'],
	["dns_server2", 'DNS_SERVER_2'],
	["microk8s_version", 'MICROK8S_VERSION'],
	["enable_nginx", 'MICROK8S_ENABLE_NGINX']
])

const requiredSpecFields = ["openstack_username", "openstack_auth_url", "openstack_password", "openstack_domain_name", "openstack_project", "openstack_user_domain_name", "image", "flavor", "security_group", "key_name", "external_network_name", "floating_ip_pool", "dns_server1", "dns_server2", "microk8s_version", "enable_nginx"]

const requiredStatusFields = []

module.exports = class CrHandler {
	constructor(options) {
		this.logger = options.getLogger("CrHandler")
		this.podRunner = new PodRunner(options)
		this.options = options

		//-------------------------------------------------------------
		//Start express web server to receive status updates from pods
		//-------------------------------------------------------------

		this.app = addAsync(express());
		this.app.use(express.json());

		this.app.use((err, req, res, next) => {
			if (err) {
				this.logger.warn("app:use: Error while processing a status report request: ", err, ", req = ", req);
				return res.status(400).send({ status: 404, message: err.message }); // Bad request
			}
			next();
		})

		this.app.postAsync('/status/:key', async (req, res) => {
			const key = req.params.key
			const statusJson = req.body
			this.logger.debug(`Received status for key ${key}`);

			const { exit_code, kubeconfig, serverlist, log_output } = statusJson
			this.logger.debug(`exit_code = ${exit_code}`)
			this.logger.debug(`kubeconfig = ${kubeconfig}`)
			this.logger.debug(`serverlist = ${serverlist}`)
			//this.logger.debug(`log_output = ${log_output}`)

			try {
				const existingPod = await this.podRunner.get(key);
				this.logger.debug(`Existing pod for key = ${key} is in phase ${existingPod.status.phase}`) //Pending, Running, Succeeded, Failed, Unknown
				await this.statusFunction(key, statusJson)

			} catch {
				this.logger.warn(`app:postAsync: No pod for key = ${key} exists, unable to set status`)
			}

			res.send("Ok")
		})

		this.app.listen(options.port, () => {
			this.logger.debug(`Started on port ${options.port}, post status to http://${options.hostname}:${options.port}/status/:id`);
		})

	}

	convertMicroK8sSpecToPod(key, mk8sSpec) {
		const envMap = new Map()
		mk8sToEnvMapping.forEach((value, key) => { if (mk8sSpec[key]) { envMap.set(value, "" + mk8sSpec[key]) } })

		envMap.set("NODE_NAME", key)
		envMap.set("GENERATED_KUBECONFIG", "/kube.conf")
		envMap.set("GENERATED_SERVER_LIST", "/server.list")
		envMap.set("STATUS_REPORT_POST_URL", `http://${this.options.hostname}:${this.options.port}/status/${key}`)

		const env = []
		envMap.forEach((value, key) => env.push({ "name": key, "value": value }))

		const spec = {
			'apiVersion': 'v1',
			'kind': 'Pod',
			'metadata': { 'name': key },
			'spec': {
				'restartPolicy': 'Never',
				'containers': [
					{
						'name': 'edsc-microk8s-playbook',
						'image': this.options.image,
						'imagePullPolicy': this.options.imagePullPolicy || "IfNotPresent",
						'env': env
					}
				]
			}
		}

		return spec
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


	//invoked by the reconciler and provides a function(key, statusPatch) which can be 
	//called to set the status of a pod
	setSetStatusFunction(statusFunction) {
		this.statusFunction = statusFunction
	}

	async isValidSpec(spec) {
		if (!spec) {
			this.logger.debug(`isValidSpec: spec is null`)
			return false;
		}

		//TODO ensure that field contains valid entries only to avoid injection
		//TODO verify that some fields do NOT exist

		return this.checkFieldsExist(requiredSpecFields, spec)
	}

	async isValidStatus(status) {
		if (!status) {
			this.logger.debug(`isValidStatus: status is null`)
			return false;
		}
		return this.checkFieldsExist(requiredStatusFields, status)
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
		this.logger.debug(`handleDeleteResource, key =`, key, `customResource = `, customResource, `resource = `, resource)
	}

	async handleCreateOrUpdateResource(key, customResource, resource) {
		this.logger.debug(`handleCreateOrUpdateResource, key =`, key)
		//this.logger.debug(`handleCreateOrUpdateResource: customResource = `, customResource, `, resource = `, resource)

		try {
			const existingPod = await this.podRunner.get(key);
			this.logger.debug(`Existing pod for key = ${key} is in phase ${existingPod.status.phase}`) //Pending, Running, Succeeded, Failed, Unknown
			//this.logger.debug(`existingPod`, JSON.stringify(existingPod, null, 3))

		} catch {
			this.logger.debug(`No pod for key = ${key} exists, creating a new one`)

			const spec = this.convertMicroK8sSpecToPod(key, customResource.spec);
			this.logger.debug(`Using spec`, JSON.stringify(spec, null, 3))

			const newPod = await this.podRunner.create(key, spec);
			this.logger.debug(`Pod created for key = ${key}:`, newPod)
		}

	}

}
