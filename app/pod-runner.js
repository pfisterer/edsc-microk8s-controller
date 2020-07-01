const k8s = require('@kubernetes/client-node');

module.exports = class PodRunner {
	constructor(options) {
		this.logger = options.getLogger("JobRunner")
		this.options = options
	}

	config() {
		const kubeConfig = new k8s.KubeConfig();
		kubeConfig.loadFromDefault();
		return kubeConfig
	}

	batchApi() {
		// https://github.com/kubernetes-client/javascript/blob/master/src/gen/api/batchV1Api.ts
		return this.config().makeApiClient(k8s.BatchV1Api);
	}

	coreApi() {
		return this.config().makeApiClient(k8s.CoreV1Api);
	}

	attachApi() {
		return new k8s.Attach(this.config())
	}

	async create(key, pod) {
		const yamlString = k8s.loadYaml(k8s.dumpYaml(pod))
		this.logger.debug("Creating pod with spec: ", k8s.dumpYaml(pod))
		return this.coreApi().createNamespacedPod(this.options.namespace, pod)
	}

	async attach(key, stdoutStream, stderrStream) {
		/*const attach = this.attachApi();
		this.logger.debug("Attach API = ", attach)
		// https://github.com/kubernetes-client/javascript/blob/master/examples/typescript/attach/attach-example.ts
		*/
		const kc = new k8s.KubeConfig();
		kc.loadFromDefault();

		const attach = new k8s.Attach(kc);
		attach.attach(this.options.namespace, key, stdoutStream, stderrStream, null /* stdin */, false /* tty */)
	}

	async get(key) {
		let result = (await this.coreApi().readNamespacedPod(key, this.options.namespace)).body
		if (result.statusCode = 200)
			return result

		throw result
	}

	async delete(key) {
		return await this.coreApi().deleteNamespacedPod(key, this.options.namespace)
	}

	async list() {
		//TODO Evaluate _continue: field
		return (await this.coreApi().listNamespacedPod(this.options.namespace)).body.items
	}

}


