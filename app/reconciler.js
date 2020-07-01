const { fixed: { setIntervalAsync: setIntervalAsync }, clearIntervalAsync } = require('set-interval-async')
const { default: Operator, ResourceEventType } = require('@dot-i/k8s-operator');
const k8s = require('@kubernetes/client-node');

module.exports = class Reconciler extends Operator {

	constructor(options) {
		super(options.getLogger("Operator"));
		this.options = options
		this.logger = options.getLogger("Reconciler");
		this.reconcileHandler = options.reconcileHandler

		this.addQueue = new Map()
		this.deleteQueue = new Map()

		this.reconcileInterval = options.reconcileInterval;
		this.setupReconcileTimer(this.reconcileInterval);

		//this.logger.debug("constructor: New instance with options: ", options);
	}

	async init() {
		this.logger.debug("init: Initializing reconciler");
		try {
			const { group, versions, plural } = await this.registerCustomResourceDefinition(this.options.crdFile);
			this.customObjectsApi = this.kubeConfig.makeApiClient(k8s.CustomObjectsApi)

			this.crdGroup = group;
			this.crdVersions = versions;
			this.crdPlural = plural;

		} catch (e) {
			this.logger.error(`Unable to register custom resource definition`, e)
			throw e
		}

		this.logger.debug(`init: Watching group ${this.crdGroup}, versions[0].name ${this.crdVersions[0].name}, plural ${this.crdPlural}`)

		let watcher = async (event) => {
			let q = event.type === ResourceEventType.Deleted ? this.deleteQueue : this.addQueue
			this.enque(q, await this.reconcileHandler.getKey(event.object.spec), event.object.spec, null)
		}

		await this.watchResource(this.crdGroup, this.crdVersions[0].name, this.crdPlural, watcher, this.options.namespace);
	}

	getCustomObjectsApi() {
		return this.customObjectsApi
	}

	async updateResourceStatus(cr, status) {
		//this.logger.debug(`updateResourceStatus: Updating status of ${cr.spec.domainName} to `, status)

		//copied from node_modules/@dot-i/k8s-operator/dist/operator.js since it is not exported
		class ResourceMetaImpl {
			constructor(id, object) {
				var _a, _b;
				if (!((_a = object.metadata) === null || _a === void 0 ? void 0 : _a.name) || !((_b = object.metadata) === null || _b === void 0 ? void 0 : _b.resourceVersion) || !object.apiVersion || !object.kind) {
					throw Error(`Malformed event object for '${id}'`);
				}
				this.id = id;
				this.name = object.metadata.name;
				this.options.namespace = object.metadata.namespace;
				this.resourceVersion = object.metadata.resourceVersion;
				this.apiVersion = object.apiVersion;
				this.kind = object.kind;
			}
			static createWithId(id, object) {
				return new ResourceMetaImpl(id, object);
			}
			static createWithPlural(plural, object) {
				return new ResourceMetaImpl(`${plural}.${object.apiVersion}`, object);
			}
		}

		let meta = ResourceMetaImpl.createWithPlural(this.crdPlural, cr);

		return await this.patchResourceStatus(meta, status)
	}

	async listItems() {
		const res = await this.customObjectsApi.listNamespacedCustomObject(
			this.crdGroup,
			this.crdVersions[0].name,
			this.options.namespace, //namespace>
			this.crdPlural,
			'false',
			'', //<labelSelectorExpresson>
		);

		return res.body.items
	}

	setupReconcileTimer() {
		// Cancel existing timer
		if (this.reconcileTimer) {
			this.logger.debug(`setupReconcileTimer: Clearing existing timer`, this.reconcileTimer)
			clearIntervalAsync(this.reconcileTimer)
		}

		// Setup new timer
		this.reconcileTimer = setIntervalAsync(async () => {
			//this.logger.debug(`setupReconcileTimer: Running reconcile from timer`)
			await this.reconcile();
		}, this.reconcileInterval)
	}

	difference(a1, a2) {
		return a1.filter(x => !a2.includes(x));
	}

	getCrForKey(customResources, key) {
		let filtered = customResources.filter(el => el.metadata.name === key)
		return filtered.length > 0 ? filtered[0] : undefined
	}

	enque(q, key, customResource, resource) {
		q.set(key, { key, customResource, resource })
	}

	async runQueues() {
		//Run delete queue
		for (const key_value of this.deleteQueue) {
			let key = key_value[0]
			let value = key_value[1]
			await this.reconcileHandler.handleDeleteResource(key, value.customResource, value.resource);
		}

		this.deleteQueue.clear();

		//Run add queue
		for (const key_value of this.addQueue) {
			let key = key_value[0]
			let value = key_value[1]
			await this.reconcileHandler.handleCreateOrUpdateResource(key, value.customResource, value.resource);

		}

		this.addQueue.clear();
	}

	async reconcile() {
		this.logger.debug(`reconcile: Starting`)
		await this.reconcileHandler.handleReconcileStart()

		const existingResources = await this.reconcileHandler.getExistingResources(); // map(key, value)
		const existingResourceKeys = existingResources ? [...existingResources.keys()] : [] // key
		const existingResourcesProvided = existingResources

		const existingCustomResources = (await this.listItems()) // array(cr)
		const existingCustomResourceKeys = existingCustomResources.map(async cr => await this.reconcileHandler.getKey(cr.spec)) // key

		if (existingResourcesProvided) {

			// Resources that exist but no matching cr exists
			let disposableResourceKeys = this.difference(existingResourceKeys, existingCustomResourceKeys)
			for (const key of disposableResourceKeys) {
				this.logger.debug(`reconcile: Disposable key = `, key)
				this.enque(this.deleteQueue, key, null, existingResources.get(key))
			}

			// CRs that exist but not matching resource exists
			let missingResourceKeys = this.difference(existingCustomResourceKeys, existingResourceKeys)
			for (const key of missingResourceKeys) {
				this.logger.debug(`reconcile: Adding key = `, key)
				this.enque(this.addQueue, key, this.getCrForKey(existingCustomResources, key), existingResources.get(key))
			}

		} else {
			this.logger.debug(`reconcile: No list of existing resources provided, skipping target vs. actual comparison`)
		}

		// CRs that have not proper status (and require update)
		let invalidStatusCustomResources = existingCustomResources.filter(async cr => !(await this.reconcileHandler.isValidStatus(cr.status)))
		for (const cr of invalidStatusCustomResources) {
			let key = await this.reconcileHandler.getKey(cr.spec)
			this.logger.warn(`reconcile: Invalid status for key = ${key}`)
			const existingResource = existingResourcesProvided ? existingResources.get(key) : null
			this.enque(this.addQueue, key, this.getCrForKey(existingCustomResources, key), existingResource)
		}

		// Process all events that are queued
		await this.runQueues()

		await this.reconcileHandler.handleReconcileEnd()
		this.logger.debug(`reconcile: Done`)
	}

}
