const log4js = require('log4js')
const { JobRunner } = require('../app/pod-runner');
const k8s = require('@kubernetes/client-node');
var fs = require('fs');

function getLogger(name) {
	let log = log4js.getLogger(name);
	log.level = "debug";
	return log
}
const namespace = "default"

const jobRunner = new JobRunner({ namespace, getLogger })

function podSpecFromCustomResourceSpec(key, crSpec) {
	return {
		"restartPolicy": "Never",
		"containers": [{
			"name": "edsc-microk8s-playbook",
			"image": "farberg/edsc-microk8s-playbook",
			"imagePullPolicy": "Never",
			"env": [
				{ name: "ANSIBLE_STDOUT_CALLBACK", value: "debug" },
				{ name: "ANSIBLE_HOST_KEY_CHECKING", value: "False" },
				{ name: "OS_AUTH_URL", value: crSpec.openstack_auth_url },
				{ name: "OS_USERNAME", value: crSpec.openstack_username },
				{ name: "OS_PASSWORD", value: crSpec.openstack_password },
				{ name: "OS_PROJECT_NAME", value: crSpec.openstack_project },
				{ name: "OS_DOMAIN_NAME", value: crSpec.openstack_domain_name },
				{ name: "NODE_NAME", value: key },
				{ name: "IMAGE", value: crSpec.image },
				{ name: "NODE_FLAVOR", value: crSpec.flavor },
				{ name: "NODE_SEC_GROUP", value: crSpec.security_group },
				{ name: "KEY", value: crSpec.key_name },
				{ name: "EXT_NET", value: crSpec.external_network_name },
				{ name: "FLOATING_IP_POOL", value: crSpec.floating_ip_pool },
				{ name: "DNS_SERVER_1", value: crSpec.dns_server1 },
				{ name: "DNS_SERVER_2", value: crSpec.dns_server2 },
				{ name: "MICROK8S_VERSION", value: crSpec.microk8s_version },
				{ name: "GENERATED_KUBECONFIG", value: "/data/generated-server-list.txt" },
				{ name: "GENERATED_SERVER_LIST", value: "/data/generated-kube.conf" },
				//---------------------------------------------
				{ name: "STATUS_REPORT_POST_URL", value: "http://edsc-microk8s-controller-service/some-id/" },
				{ name: "USE_SSH_PRIV_KEY", value: "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABFwAAAAdzc2gtcn\nNhAAAAAwEAAQAAAQEA4gFzq8S99CimmoYbDKNGm7gOMa+xFHv1M1tm6QbU1MAg3VHiCuxS\n50fGw/MMRcNzDxdVUMp+8OlB6EkJ2UrWnWQIab7oK0ID0/zeenaquK2eEimUPZF/eP3dCX\nZZwSyMgImavO8buQxpRsdYTCbYVJg43Eolxi5DNz+r01XVB6PLuEC8qVq66VKRFQDxp5zC\nWB2J9topZV/yOx0koPHS3884wE4BW/4+SY09NUWfjUOR9T85MEHIKItfy2JdF8sLYP27A8\nR/EYA3KmZgqXEhPPQTWLKWmZF+2u+Fu6+CKs0XsJXBLen0PIKeVN17SR0AxAVPvkVdSnfA\nyjXOgM4Y0wAAA8hML63TTC+t0wAAAAdzc2gtcnNhAAABAQDiAXOrxL30KKaahhsMo0abuA\n4xr7EUe/UzW2bpBtTUwCDdUeIK7FLnR8bD8wxFw3MPF1VQyn7w6UHoSQnZStadZAhpvugr\nQgPT/N56dqq4rZ4SKZQ9kX94/d0JdlnBLIyAiZq87xu5DGlGx1hMJthUmDjcSiXGLkM3P6\nvTVdUHo8u4QLypWrrpUpEVAPGnnMJYHYn22illX/I7HSSg8dLfzzjATgFb/j5JjT01RZ+N\nQ5H1PzkwQcgoi1/LYl0Xywtg/bsDxH8RgDcqZmCpcSE89BNYspaZkX7a74W7r4IqzRewlc\nEt6fQ8gp5U3XtJHQDEBU++RV1Kd8DKNc6AzhjTAAAAAwEAAQAAAQEA3MDqSSc9G5XxVhIT\nrb52I3gedS3VW9rQYL+wv4CqtryL3WIz1tOLDtmvLoriu+nzIxR5gxan840DkW52LkbJZq\nblCNUuVcJ/lrryXNA4ZXdAZSEz6QeLaZUeKDXv6Z4oBw1hlZZAj/mtgzMH7iorOEYPlCzg\nxLk/cmHA5gZ6tJ/VRhlEcmDVPkrgIf86WkZxom3J6lGTmI0yylzxBCbD9/ISz324LG+7ZH\nBQsYJ6RxlwDwWNBks0bEHms7pTYQNY0h1zTQxWir7PrD3unVYeA73fDKcnxBMRcZbeQLdZ\nffkdBJ6Vts8t4NlkkNL2qN1rCCip9LShMtZA7SYncLKRYQAAAIB8BP4qQhQ458LgbIqPF5\nLoy2c/PT9eiOG1unaJN21SMSqAJdqxzDVjrlIpV8GtuHEAFiz3qgAGr154bgOctululfZ0\n38awBTLVofQgCw7W8eKqGiPG6karsBzZS7q/Ogh1UVa+NLPRre2VyBJA58MOePi6zrTRnG\n1OXb8ygZFWdQAAAIEA9a6WchfmlM9GKSQkyDcN28B2NoHFewaxg4NXMFD0xtcN+8kxBe4n\ns00OpNN+32bA3uX6ZvIXXZ5q1DlAaHxxFisNF/fm7k1ud3JDMbZrBzIDAQA3bTZY5j8OZ2\nRTLT7xhpsnn468B1DdsWZVnHI/7A1DzvvFdghMnV8zSCOeu/sAAACBAOt/UTqEYSN1NDxQ\nnhwsLY/50YX9Z63nys4PCxHYer89eqiXa4a75LNULCkmpgvtc8EL95T8H4suvOIW4ixLFg\neFVmiydmXPmvswqBpXOyH6Qf6q91tZBR0CYjoWvpC+MXjTemxeLI4VyjlEJVmfAvHuYooO\nZpLCU6BeevPArucJAAAADXJvb3RAbGFsYTEyMzQBAgMEBQ==\n-----END OPENSSH PRIVATE KEY-----\n" },
				{ name: "USE_SSH_PUB_KEY", value: "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDiAXOrxL30KKaahhsMo0abuA4xr7EUe/UzW2bpBtTUwCDdUeIK7FLnR8bD8wxFw3MPF1VQyn7w6UHoSQnZStadZAhpvugrQgPT/N56dqq4rZ4SKZQ9kX94/d0JdlnBLIyAiZq87xu5DGlGx1hMJthUmDjcSiXGLkM3P6vTVdUHo8u4QLypWrrpUpEVAPGnnMJYHYn22illX/I7HSSg8dLfzzjATgFb/j5JjT01RZ+NQ5H1PzkwQcgoi1/LYl0Xywtg/bsDxH8RgDcqZmCpcSE89BNYspaZkX7a74W7r4IqzRewlcEt6fQ8gp5U3XtJHQDEBU++RV1Kd8DKNc6AzhjT root@lala1234" }
				//TODO? enable_nginx
				//TODO? openstack_user_domain_name
			]
			//"command": ["ansible-playbook", "-vv", "--skip-tags", "ssh-keyscan"]
		}]
	}
}

async function main() {
	const cr = k8s.loadYaml(fs.readFileSync("./test/private-demo-microk8s.yaml"))
	const key = "lala1234"
	const spec = podSpecFromCustomResourceSpec(key, cr.spec)

	try {
		console.log("Creating pod")
		await jobRunner.create(key, spec)
		console.log("Attaching to pod")
		//await jobRunner.attach(key, process.stdout, process.stderr)
	} catch (e) {
		console.error(e)
	}

	setInterval(async () => {
		try {
			//const l = await jobRunner.list()
			//const l = await jobRunner.get(key)
			//console.log(new Date(), l);
		} catch (e) {
			console.log("error, no pod exists")
		}

	}, 1000)

	setTimeout(async () => {
		//console.log("Deleting key = ", key)
		//jobRunner.delete(key)
	}, 10 * 1000)
}


(async () => main())();