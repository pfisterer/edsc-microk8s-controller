const log4js = require('log4js')
const { program: optionparser } = require('commander')

const CrHandler = require("./cr-handler.js");
const Reconciler = require("./reconciler");

// ------------------------------------------------
// Parse command line options
// ------------------------------------------------

let options = optionparser
	.storeOptionsAsProperties(true)
	.option('-v, --verbose', "Display verbose output", false)
	.option('--crd-file <filename>', 'CRD filename', './config/micro-k8s-crd-def-v1beta1.yaml')
	.option('--namespace <ns>', 'Kubernetes namespace', 'default')
	.option('--reconcile-interval <ms>', "Reconcile interval in millis", 10000)
	.option('--mode <mode>', 'The mode to start the app in (development or production)', 'production')
	.version('0.0.1alpha')
	.addHelpCommand()
	.parse()
	.opts()

// ------------------------------------------------
// Set global log level options
// ------------------------------------------------

let logLevel = options.verbose ? "debug" : "info";

function getLogger(name) {
	let log = log4js.getLogger(name);
	log.level = logLevel;
	return log
}

// ------------------------------------------------
// Create options to be used for the app
// ------------------------------------------------

options = Object.assign({}, options, {
	logger: getLogger
})

// ------------------------------------------------
// Main
// ------------------------------------------------

async function main(options) {
	const logger = getLogger("main")
	logger.debug(`Starting with options`, options)

	//Create reconciler
	const reconcileHandler = new CrHandler(Object.assign({}, { getLogger }, options));
	const reconciler = new Reconciler(Object.assign({}, { getLogger, reconcileHandler }, options))
	await reconciler.start();
}

// ------------------------------------------------
// Start main method
// ------------------------------------------------

(async () => main(options)
	.then(() => console.log("Main done"))
	.catch(e => { console.log("Error in main: ", e); process.exit(1) })
)();
