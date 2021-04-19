const dns = require('dns')
const os = require('os')
const log4js = require('log4js')
const { program: optionparser } = require('commander')
const Operator = require('./operator');
const MicroK8sHandler = require('./microk8s-handler')
const RetryHandler = require('./retry-handler')
const DummyHandler = require('./dummy-handler')


// ------------------------------------------------
// Parse command line options
// ------------------------------------------------

let options = optionparser
	.storeOptionsAsProperties(true)
	.option('-v, --verbose', "Display verbose output", false)
	.option('--crd-file <filename>', 'CRD (custom resource definition) filename', './config/micro-k8s-crd-def-v1beta1.yaml')
	.option('--namespace <ns>', 'Kubernetes namespace', 'default')
	.option('--mode <mode>', 'The mode to start the app in (development or production)', 'production')
	.option('--hostname <hostname>', 'Hostname to use for constructing the status report URL', undefined)
	.option('--port <port>', 'Port to start the status collection server on', 8080)
	.option('--image <image>', 'Docker image (and tag) to use', 'farberg/edsc-microk8s-playbook')
	.option('--image-pull-policy <policy>', 'Image pull policy to use for the pod spec', 'Always')
	.option('--cleanup-interval <interval>', 'Interval in ms to cleanup resources periodically', 60 * 1000)
	.option('--retry-interval <interval>', 'Interval in ms after which to retry add/delete', 5 * 1000)
	.option('--retry-count-max <count>', 'Max retries', 5)
	.version('0.0.2alpha')
	.addHelpCommand()
	.parse()
	.opts()


// ------------------------------------------------
// Set global options
// ------------------------------------------------

let logLevel = options.verbose ? "debug" : "info";

function getLogger(name) {
	let log = log4js.getLogger(name);
	log.level = logLevel;
	return log
}

options = Object.assign({}, options, { getLogger })

// ------------------------------------------------
// Main
// ------------------------------------------------

async function main1(options) {
	const K8sHelper = require('./k8s-helper')
	const k8shelper = new K8sHelper(options)
	const dumyHandler = new DummyHandler(options)

	//Test pod exists
	if (false) {
		try { console.log(await k8shelper.getPod("bla1")); } catch { console.log("no pod"); }
	}

	//Retry proxy
	if (false) {
		const operator = new Operator(options, dumyHandler)

		//Operator

		setTimeout(async () => {
			try {
				console.log(await operator.crExists('microk8s-pfisterer-controller-demo-microk8'))
			} catch (error) {
				console.error(error)
			}
		}, 2000)
		await operator.run()
	}

	// 
	if (true) {
		const operator = new Operator(options, dumyHandler)
		setTimeout(async () => {
			try {

				console.log("Patch result: ",
					await operator.patchCrStatus('microk8s-pfisterer-controller-demo-microk8',
						{
							"bla": "blubb"
						}
					)
				)
			} catch (error) {
				console.error("Error", error?.body ? error.body : error)
			}
		}, 2000)
		await operator.run()
	}

}

async function main(options) {
	const logger = getLogger("main")
	logger.debug(`Starting with options`, options)

	//Handler
	const handler = new MicroK8sHandler(options)
	const handlerStatusUpdateFunction = async (cr, status, error) => {
		return handler.updateStatus(handler.keyFromCR(cr), {
			'controller_status': status,
			'last_error': error
		})
	}

	//Retry proxy
	const retryHandler = new RetryHandler(options, handler, handlerStatusUpdateFunction)

	//Operator
	const operator = new Operator(options, retryHandler)
	await operator.run()

}

// ------------------------------------------------
// Start main method
// ------------------------------------------------

async function run_main(options, main_func) {
	if (!options.hostname) {
		dns.lookup(os.hostname(), function (err, address, fam) {
			options.hostname = address
			console.log(`Using hostname ${options.hostname} since no --hostname option was supplied.`)
			return main_func(options);
		})
	} else {
		return main_func(options);
	}
}

(async () => run_main(options, main)
	.then(() => console.log("Main done..."))
	.catch(e => { console.log("Error in main: ", e); process.exit(1) })
)();
