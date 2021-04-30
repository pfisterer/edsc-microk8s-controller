module.exports = class RetryHandler {
	constructor(options, delegate, statusFunction) {
		this.logger = options.getLogger("RetryHandler")
		this.options = options
		this.delegate = delegate
		this.statusFunction = statusFunction || function (cr, status, error) { this.logger.debug("Status update for cr:", cr, status, error); }
	}

	async start(informer, crApi, crd, operator) {
		this.crApi = crApi
		this.crd = crd
		this.operator = operator

		return await this.delegate.start(informer, crApi, crd, operator)
	}

	async stop() {
		return await this.delegate.stop()
	}

	async added(cr) {
		return this.retry(async () => this.delegate.added(cr), cr, true)
	}

	async updated(cr) {
		return this.retry(async () => this.delegate.updated(cr), cr, true)
	}

	async deleted(cr) {
		return this.retry(async () => this.delegate.deleted(cr), cr, false)
	}

	async retry(fn, cr, verifyCrExists) {
		const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

		for (let retry = 1; retry <= this.options.retryCountMax; retry++) {
			try {

				//Check that the resource still exists if this isn't the first try
				if (verifyCrExists && retry > 1) {
					try {
						await this.operator.k8sHelper().crExists(cr.metadata.name)
					} catch (error) {
						this.logger.warn(`Error in retry ${retry}/${this.options.retryCountMax}: CR ${cr.metadata.name} does not exist anymore:`, error)
						throw `Error in retry ${retry}/${this.options.retryCountMax}: CR ${cr.metadata.name} does not exist anymore`
					}
				}

				return await fn();
			} catch (error) {
				this.statusFunction(cr, `Error occured in retry ${retry}/${this.options.retryCountMax}`, error)
				const delayMs = Math.pow(2, retry) * this.options.retryInterval;
				this.logger.debug("Retry delay is ", delayMs, "ms")
				await delay(delayMs);
			}
		}

		this.statusFunction(cr, `Failed retrying ${this.options.retryCountMax} times`)
		throw new Error(`Failed retrying ${this.options.retryCountMax} times`);
	}

}