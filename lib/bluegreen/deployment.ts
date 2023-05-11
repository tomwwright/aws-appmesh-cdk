import { Construct } from "constructs";

import { SSM } from "@aws-sdk/client-ssm";
import { App } from "aws-cdk-lib";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { VirtualNode } from "aws-cdk-lib/aws-appmesh";

export const BLUE_GREEN_STATE = "blue-green-state";

/**
 * retrieves the state from Parameter Store and uses the
 * `setContext` API to inject the state into the App
 *
 * if the context already exists then this procedure is skipped,
 * this allows for the context to be injected via some other means
 * through `cdk.context.json`
 *
 * currently this proof-of-concept just uses a fixed parameter
 * name and would need to be extended with some sort of naming
 * schema
 *
 * @param app to inject context into with node.setContext API
 */
export async function injectBlueGreenState(app: App) {
  let state: BlueGreenState | null = null;

  /**
   * check for state already being populated
   */

  const existingContext = app.node.tryGetContext(BLUE_GREEN_STATE);
  if (existingContext) {
    state = existingContext;
  } else {
    /**
     * perform retrieval of state from Parameter Store
     */

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

  /**
   * if at this state we still have no state, assume
   * some defaults to allow for the stack to be bootstrapped
   */

  if (!state) {
    state = {
      nextUpdate: "blue",
      currentVersion: 1,
      previousVersion: 1,
    };
  }

  /**
   * inject state into root node using the Context API
   */

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

    /**
     * expect to retrieve our state from the Context API
     *
     * you mind suspect that this is the perfect use case for something
     * like `ssm.StringParameter.fromLookup()` but it doesn't work as expected!
     *
     * context providers from lookup actually execute _after_ construction
     * of the construct tree and so you are unable to leverage that data for
     * code logic!
     *
     * hence we rely on the Context API as populated in ./bin/bluegreen.ts
     * prior to entering the construct tree
     *
     * see: https://github.com/aws/aws-cdk/issues/8273#issuecomment-824801527
     */

    const contextData = scope.node.tryGetContext(BLUE_GREEN_STATE);
    if (!contextData) {
      throw new Error("Unable to operate without context");
    }
    const currentState: BlueGreenState = contextData;

    /**
     * perform our core logic on state and the provided version and
     * construct the resource to manage it in Parameter Store
     *
     * if the version has changed, then flip our update stack and
     * rotate versions
     *
     * else retain the current state, producing an empty diff
     */

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

    /**
     * now determine the appropriate versions of blue and green
     * based on our state
     */

    const blueVersion =
      newState.nextUpdate == "blue"
        ? newState.currentVersion
        : newState.previousVersion;
    const greenVersion =
      newState.nextUpdate == "green"
        ? newState.currentVersion
        : newState.previousVersion;

    /**
     * produce a construct for blue and green
     * and run our provided .build function
     * against each to build our app
     *
     * the appropriate version is passed -- this doesn't
     * have to be a value and could really be any data that
     * we want to track in state
     */

    const blue = new Construct(this, "Blue");
    const green = new Construct(this, "Green");

    this.blue = props.build(blue, blueVersion);
    this.green = props.build(green, greenVersion);

    /**
     *
     */
  }
}
