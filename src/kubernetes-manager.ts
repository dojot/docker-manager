import util = require("util");
import when = require("when");
import fs = require("fs");
import Api = require("kubernetes-client");

import { ContainerManagerInterface } from "./docker-manager";
import { ContainerSet } from "./container";
import { ManagerConfiguration, TLSConfiguration } from "./config";


interface K8sMetadata {
  [attribute : string] : any;
}

interface K8sSpec {
  [attribute : string] : any;
}

interface K8sManifest {
  apiVersion: "extensions/v1beta1",
  kind: "Namespace" | "Deployment",
  metadata: K8sMetadata,
  spec: K8sSpec,
}
        
interface ContainerTemplate {
  image: string;
  imagePullPolicy: "Never",
  name: string;
}

class KubernetesManager implements ContainerManagerInterface {
  host: string;
  token: string;
  tls: TLSConfiguration;
  connectionConfig: Api.ApiGroupOptions;

  constructor(config: ManagerConfiguration) {
    console.log("Using kubernetes driver.");
    this.host = "";
    this.token = "";
    this.tls = {
      passphrase: "",
      ca: "",
      cert: "",
      key: ""
    }

    if (config.engine == "kubernetes" && config.kubernetes) {
      this.host = config.kubernetes.url;
      if (config.kubernetes.securityMode == "token" && config.kubernetes.token) {
        console.log("Using access token.");
        try {
          let tokenFile = fs.readFileSync(config.kubernetes.token);
          this.token = tokenFile.toString();
        } catch {
          // Throw exception or return error
        } 
      } else if (config.kubernetes.securityMode == "ca" && config.kubernetes.tls) {
        console.log("Using regular certificates and cryptographic keys.");
        try {
          let caFile = fs.readFileSync(config.kubernetes.tls.ca);
          let certFile = fs.readFileSync(config.kubernetes.tls.cert);
          let keyFile = fs.readFileSync(config.kubernetes.tls.key);
          this.tls.ca = caFile.toString();
          this.tls.cert = certFile.toString();
          this.tls.key = keyFile.toString();
          this.tls.passphrase = config.kubernetes.tls.passphrase;
        } catch {
          // Throw exception or return error
        }
      }
    } else {
      // Throw exception or return error
    }

    this.connectionConfig = {
      url: this.host,
      version: "v1beta1",
      ca: this.tls.ca,
      key: this.tls.key,
      auth: {
        bearer: this.token
      }
    }
  }

  setupAndRunContainerSet(containerSet: ContainerSet, namespace: string): When.Promise<ContainerSet> {
    return when.promise((resolve, reject) => {
      let deploymentObj: K8sManifest = {
        apiVersion: "extensions/v1beta1",
        kind: "Deployment",
        metadata: {
          labels: {
            name: containerSet.name
          },
          name: containerSet.name
        },
        spec: {
          replicas: 1,
          template: {
            metadata: {
              labels: {
                name: containerSet.name
              }
            },
            spec: {
              containers:[
              ],
              restartPolicy: "Always"
            }
          }
        }
      }

      for (let container of containerSet.containers) {
          let containerTemplate: ContainerTemplate = {
            name: container.name,
            image: container.image,
            imagePullPolicy: "Never"
          }
          deploymentObj.spec.template.spec.containers.push(containerTemplate);
      }

      this.connectionConfig.version = "v1beta1"
      const ext = new Api.Extensions(this.connectionConfig);

      ext.namespaces!("default").deployments!.post({ body: deploymentObj}, (error, value) => {
        console.log("Error: " + util.inspect(error, {depth: null}));
        console.log("Value: " + util.inspect(value, {depth: null}));
        if (error == null) {
          resolve(containerSet);
        } else {
          reject(error);
        }
      });
    });
  }

  killAndRemoveContainerSet(containerSetId: string): When.Promise<number> {
    return when.promise((resolve, reject) => {

      this.connectionConfig.version = "v1beta1"
      const ext = new Api.Extensions(this.connectionConfig);

      ext.namespaces!("default").deployments!(containerSetId).delete({ }, (error, value) => {
        console.log("Error: " + util.inspect(error, {depth: null}));
        console.log("Value: " + util.inspect(value, {depth: null}));
        if (error == null) {
          resolve(0);
        } else {
          reject(error);
        }
      });
    });
  }
}

export { KubernetesManager };