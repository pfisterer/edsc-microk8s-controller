# EDSC MicroK8s Controller

## Local Development

Run `npm start`

## Build the Docker container

Run `docker build -t farberg/edsc-microk8s-controller .`

## Development Deployment to K8S

Run `skaffold dev`

Periodically add and remove a CR:

```bash
while true; do 
	DELAY=10s
	k apply -f test/private-demo-microk8s.yaml
	sleep $DELAY; k delete microkeights.mk8.farberg.de --all
	sleep $DELAY
done
```

## Development Deployment to K8S

Run `skaffold run`

## FAQ

I'm getting errors like 

```console
Exception in main method: Error: customresourcedefinitions.apiextensions.k8s.io is forbidden: User "system:serviceaccount:default:default" cannot create resource "customresourcedefinitions" in API group "apiextensions.k8s.io" at the cluster scope
````

Solution

- Create missing RBAC roles
- For development (e.g., in Minikube), run 

```console
kubectl create clusterrolebinding \
	--clusterrole=cluster-admin \
	--user=system:serviceaccount:default:default \
	--clusterrole=cluster-admin \
	--user=system:serviceaccount \
	rds-admin-binding
```
