import { Construct } from "constructs";

import { SSM } from "@aws-sdk/client-ssm";
import { App } from "aws-cdk-lib";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { VirtualNode } from "aws-cdk-lib/aws-appmesh";

export const BLUE_GREEN_STATE = "blue-green-state";

export async function injectBlueGreenState(app: App) {
  let state: BlueGreenState | null = null;

  const existingContext = app.node.tryGetContext(BLUE_GREEN_STATE);
  if (existingContext) {
    state = existingContext;
  } else {
    const ssm = new SSM({});

    try {
      const response = await ssm.getParameter({
        Name: BLUE_GREEN_STATE,
      });

      const parameterState = response.Parameter?.Value;

      if (parameterState) {
        state = JSON.parse(parameterState);
      }
    } catch (e) {}
  }

  if (!state) {
    state = {
      nextUpdate: "blue",
      currentVersion: 1,
      previousVersion: 1,
    };
  }

  app.node.setContext(BLUE_GREEN_STATE, state);
}

interface Props {
  build: (scope: Construct, version: number) => VirtualNode;
  version: number;
}

type BlueGreenState = {
  nextUpdate: "blue" | "green";
  currentVersion: number;
  previousVersion: number;
};

export class BlueGreenDeployment extends Construct {
  public readonly blue: VirtualNode;
  public readonly green: VirtualNode;
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    // manage state

    // using ss.StringParameter.fromLookup() doesn't work as expected!
    // Context providers actually execute _after_ construction
    // So leveraging data plugged into Context directly instead
    // see: https://github.com/aws/aws-cdk/issues/8273#issuecomment-824801527
    const contextData = scope.node.tryGetContext(BLUE_GREEN_STATE);
    if (!contextData) {
      throw new Error("Unable to operate without context");
    }
    const currentState: BlueGreenState = contextData;

    // if the version has updated, flip stacks and update versions
    let newState = currentState;
    if (currentState.currentVersion != props.version) {
      newState = {
        nextUpdate: currentState.nextUpdate == "blue" ? "green" : "blue",
        currentVersion: props.version,
        previousVersion: currentState.currentVersion,
      };
    }

    new StringParameter(this, "StateParameter", {
      parameterName: BLUE_GREEN_STATE,
      stringValue: JSON.stringify(newState),
    });

    // construct services

    const blue = new Construct(this, "Blue");
    const green = new Construct(this, "Green");

    const blueVersion =
      newState.nextUpdate == "blue"
        ? newState.currentVersion
        : newState.previousVersion;
    const greenVersion =
      newState.nextUpdate == "green"
        ? newState.currentVersion
        : newState.previousVersion;

    this.blue = props.build(blue, blueVersion);
    this.green = props.build(green, greenVersion);
  }
}
