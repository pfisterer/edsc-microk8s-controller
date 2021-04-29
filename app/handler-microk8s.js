const K8sHelper = require('./k8s-helper')
const express = require('express')
const { addAsync } = require('@awaitjs/express');

const mk8sToEnvMapping = new Map([
	["openstack_username", 'OS_USERNAME'],
	["openstack_auth_url", 'OS_AUTH_URL'],
	["openstack_password", 'OS_PASSWORD'],
	["openstack_domain_name", 'OS_DOMAIN_NAME'],
	["openstack_user_domain_name", 'OS_USER_DOMAIN_NAME'],
	["openstack_project", 'OS_PROJECT_NAME'],
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

const requiredStatusFields = ["kubeconfig"]

module.exports = class MicroK8sHandler {

	constructor(options) {
		this.logger = options.getLogger("MicroK8sHandler")
		this.options = options
		this.k8s = new K8sHelper(options);
	}

	async start(informer, crApi, crd, operator) {
		this.crApi = crApi
		this.crd = crd
		this.informer = informer
		this.operator = operator

		this.logger.debug(`start: Setting reconcile interval to ${this.options.cleanupInterval}`)
		this.reconcile();
		this.timerId = setInterval(() => this.reconcile(), this.options.cleanupInterval)
		this.startStatusHandlerWebServer()
	}

	async stop() {
		clearInterval(this.timerId)
		this.httpServer.close(() => this.logger.debug("HTTP server closed"))
	}

	async updated(cr) {
		//this.logger.error("updated: Not implemented")
	}

	async added(cr) {
		const key = this.keyFromCR(cr);

		if (await this.k8s.podExists(key)) {
			this.logger.info(`added: another operation (pod ${key}) is running`)
			throw `Another operation is running (pod ${key}). Delete this request and issue a new one.`
		}

		const podSpec = this.convertMicroK8sSpecToPod(key, cr.spec);
		this.logger.info(`added: No pod with name ${key} exists, triggering creation with pod spec\n`, JSON.stringify(podSpec, null, 3))

		await this.k8s.createPod(podSpec);

		this.updateStatus(key, { "controller_status": `Created new Ansible pod instance with name = ${key}` })
	}

	async deleted(cr) {
		const key = this.keyFromCR(cr);

		// Delete existing create pod
		if (await this.k8s.podExists(key)) {
			await this.k8s.deletePod(key);
			this.logger.debug(`deleted: key =`, key, ": deleted existing pod ", key)
		} else {
			this.logger.debug(`deleted: key =`, key, ": no pod exists, nothing to delete")
		}

		//Create delete pod
		const deleteSpec = this.convertMicroK8sSpecToPod(key, cr.spec, true);
		this.logger.debug(`deleted: Using spec`, JSON.stringify(deleteSpec, null, 3))
		await this.k8s.createPod(deleteSpec)
	}

	async reconcile() {
		// Remove "create" pods where no matching custom resource exists
		for (let pod of (await this.k8s.getPods("owner=edsc-microk8s-controller,task=create"))) {
			const matchingCrExists = (await this.operator.k8sHelper().crExists(pod.metadata.name))

			if (!matchingCrExists) {
				this.logger.debug(`reconcile: Removing pod ${pod.metadata.name} because no matching CR with the same name exists`)
				await this.k8s.deletePod(pod.metadata.name)
			}
		}

		// Remove "delete" pods that have completed (i.e., the CR was deleted and the delete pod has completed)
		for (let pod of (await this.k8s.getPods("owner=edsc-microk8s-controller,task=delete"))) {
			if (pod.status.phase != "Pending" && pod.status.phase != "Running") {
				this.logger.debug(`reconcile: Removing delete pod ${pod.metadata.name} in phase ${pod.status.phase}`)
				await this.k8s.deletePod(pod.metadata.name)
			}
		}

		// Create "create" pods when no one exists in "completed" state
		try {
			for (let cr of (await this.k8s.listCrs())) {
				if (!this.k8s.podExists(cr.metadata.name)) {
					this.logger.debug(`reconcile: No pod exists for ${pod.metadata.name}, re-creating it`)
					this.added(cr)
				}
			}
		} catch (error) {
			this.logger.debug("Unable to list CRs", error)
		}

	}

	async updateStatus(key, status) {
		if (!this.crApi) {
			this.logger.warn("updateStatus: No CR api client available, doing nothing")
			return
		}

		this.logger.debug(`updateStatus: Status update for key ${key}: status = `, status)
		try {
			return await this.operator.k8sHelper().patchCrStatus(key, status)
		} catch (error) {
			this.logger.error("updateStatus: error patching status:", error?.body ? error.body : error)
		}
	}

	keyFromCR(cr) {
		return cr.metadata.name;
	}

	/** Start express web server to receive status updates from pods
	**/
	startStatusHandlerWebServer() {
		// Create express app
		this.app = addAsync(express());
		this.app.use(express.json());

		// Dump express error messages to the log
		this.app.use((err, req, res, next) => {
			if (err) {
				this.logger.warn("startStatusHandlerWebServer:use: Error while processing a status report request: ", err, ", req = ", req);
				return res.send({ status: 404, message: err.message }); // Bad request
			}
			next();
		})

		// Handle status updates via POST
		this.app.postAsync('/status/:key', async (req, res) => {
			const key = req.params.key
			const statusJson = req.body
			this.logger.debug(`startStatusHandlerWebServer: Web server received status update for key ${key}`);

			try {
				const existingPod = await this.k8s.getPod(key);

				this.logger.debug(`startStatusHandlerWebServer: Existing pod with name = ${key} is in phase ${existingPod.status.phase}`)
				this.updateStatus(key, Object.assign({}, { podStatus: existingPod.status.phase }, statusJson))

			} catch {
				this.logger.warn(`startStatusHandlerWebServer::postAsync: No pod for key = ${key} exists, unable to set status`)
			}

			res.send("Ok")
		})

		// Start web server
		this.httpServer = this.app.listen(this.options.port, () => {
			this.logger.debug(`Started on port ${this.options.port}, post status to http://${this.options.hostname}:${this.options.port}/status/:id`);
		})
	}

	convertMicroK8sSpecToPod(key, mk8sSpec, createDeleteSpec) {
		if (!this.isValidSpec(mk8sSpec)) {
			throw new Error("Invalid spec provided")
		}

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
			'metadata': {
				'name': key,
				'labels': {
					'owner': 'edsc-microk8s-controller',
					'task': createDeleteSpec ? 'delete' : 'create'
				}
			},
			'spec': {
				'restartPolicy': 'Never',
				'containers': [
					{
						'name': 'playbook',
						'image': this.options.image,
						'imagePullPolicy': this.options.imagePullPolicy,
						'env': env,
						'args': ["ansible-playbook", createDeleteSpec ? "destroy.yaml" : "deploy.yaml"]
					}
				]
			}
		}

		return spec
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

	checkFieldsExist(fields, object) {
		for (const field of fields) {
			if (!object[field]) {
				this.logger.debug(`checkFieldsExist: Field ${field} missing in `, object)
				return false
			}
		}
		return true
	}

}