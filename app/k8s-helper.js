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

}

