import { App, Stack } from "aws-cdk-lib";
import { IConnectable } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { BlueGreenDeployment } from "./blue-green";
import { ClusterStack } from "./cluster";
import { ExpressJsAppMeshService } from "./express-app-mesh";
import { MeshStack } from "./mesh";

interface Props {
  namespaceName: string;
  externalAccess: IConnectable;
}

export class BlueGreenApp extends Construct {
  constructor(scope: App, id: string, props: Props) {
    super(scope, id);

    const { namespaceName, externalAccess } = props;

    const stack = new Stack(this, "blue-green");

    const clusterStack = new ClusterStack(stack, "Cluster", {
      namespaceName,
    });

    const { cluster, httpNamespaceName, namespace } = clusterStack;

    const meshStack = new MeshStack(stack, "Mesh", {
      cluster,
      namespace,
      externalAccess,
    });

    const { mesh, gateway, securityGroup } = meshStack;

    const meshThings = {
      cluster,
      namespace,
      httpNamespaceName,
      mesh,
      gateway,
      securityGroup,
    };

    new BlueGreenDeployment(stack, "Deploy", {
      version: 3,
      build: (scope, version) => {
        new ExpressJsAppMeshService(scope, "Service", {
          serviceName: scope.node.id,
          ...meshThings,
        });
      },
    });
  }
}
