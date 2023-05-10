# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template

## Deploy Blue Green

Deploy AWS stack

```
yarn cdk --app "yarn ts-node bin/bluegreen.ts" deploy
```

Retrieve the load balancer hostname from the CloudFormation Outputs of the stack and use it to run the client

```
> yarn start blueg-MeshG-xxxx-xxxx.elb.ap-southeast-2.amazonaws.com
❯ yarn start blueg-MeshG-199JCBZL6CQMI-54586324aeeb125f.elb.ap-southeast-2.amazonaws.com
yarn run v1.22.15
$ ts-node bin/client.ts blueg-MeshG-199JCBZL6CQMI-54586324aeeb125f.elb.ap-southeast-2.amazonaws.com
Running against http://blueg-MeshG-199JCBZL6CQMI-54586324aeeb125f.elb.ap-southeast-2.amazonaws.com/service-blue-green
200 OK Green:3=1
200 OK Green:3=2
200 OK Blue:4=1 Green:3=2
200 OK Blue:4=1 Green:3=3
200 OK Blue:4=2 Green:3=3
200 OK Blue:4=3 Green:3=3
200 OK Blue:4=3 Green:3=4
200 OK Blue:4=3 Green:3=5
200 OK Blue:4=4 Green:3=5
...
```
