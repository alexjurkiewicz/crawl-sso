import { APIGatewayEvent, Callback, Context, Handler } from 'aws-lambda';
import DynamoDB = require('aws-sdk/clients/dynamodb');
import KMS = require('aws-sdk/clients/kms');

const USERS_TABLE = process.env.USERS_TABLE as string;
const KMS_KEY = process.env.KMS_ALIAS as string;

var dynamodb = new DynamoDB();
var kms = new KMS();

interface LambdaResponse {
    statusCode: number,
    body: string,
}

async function kmsEncrypt(data: string) {
    console.log("Encrypting data");
    const params = {
        KeyId: KMS_KEY,
        Plaintext: data,
    }
    const encrypted_data = await kms.encrypt(params).promise().then(data => data);
    return encrypted_data['CiphertextBlob'] as string;
}

function lambdaResponse(code: number, body: object): LambdaResponse {
    return {
        'statusCode': code,
        'body': JSON.stringify(body),
    };
}

async function getUser(username: string) {
    let params = {
        ExpressionAttributeValues: {
            ":v1": {
                S: username
            }
        },
        KeyConditionExpression: "username = :v1",
        TableName: USERS_TABLE,
    };
    return await dynamodb.query(params).promise().then(((data) => {
        // We know DynamoDB will always return an array for us here
        if (data!.Items!.length !== 0) {
            return (data.Items as DynamoDB.AttributeMap[])[0];
        } else {
            return null;
        }
    }));
}

export const hello: Handler = (event: APIGatewayEvent, context: Context, cb?: Callback) => {
    const response = {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Go Serverless Webpack (Typescript) v1.0! Your function executed successfully!',
            input: event,
        }),
    };

    if (cb) {
        cb(null, response);
    }
}

exports.registerUser = async (event: APIGatewayEvent) => {
    let response = {};
    const user = await getUser('chequers');
    const password = 'qwerty';
    const password_hash = await kmsEncrypt(password);
    console.log("Back from encryption");
    if (user) {
        console.log("User already exists. Reporting this.")
        // return lambdaResponse(400, {
        //     "message": "User already exists"
        // });
        return {
            'statusCode': 400,
            'body': JSON.stringify({"message": "User already exists"}),
        }
    }

    const dynamo_item = {
        Item: {
            "username": {
                S: "chequers"
            },
            "email": {
                S: "alex@jurkiewi.cz"
            },
            "password": {
                S: password_hash
            }
        },
        TableName: USERS_TABLE,
    };
    console.log("About to try registering user")
    response = await dynamodb.putItem(dynamo_item).promise()
        .then((data) => {
            console.log("Generating success response");
            return lambdaResponse(200, {
                message: "Added user",
                user: { "user": "TBD" }
            });
        }
        ).catch((err) => {
            console.log("Generating failure response");
            return lambdaResponse(400, {
                message: "Failed to add user",
                error: err,
            });
        }
    );
    console.log(`Response: ${response}`);
    return response;
}

export const loginUser: Handler = (event: APIGatewayEvent, context: Context, cb?: Callback) => {
    let response = {};
    let params = {
        ExpressionAttributeValues: {
            ":v1": {
                S: "chequers"
            }
        },
        KeyConditionExpression: "username = :v1",
        TableName: USERS_TABLE,
    };
    dynamodb.query(params, function(err, data) {
        if (err) {
            response = lambdaResponse(400, {
                message: "Bad login request",
                error: err,
            });
        } else {
            // We know DynamoDB will always return an array for us here
            if (data!.Items!.length === 0) {
                response = lambdaResponse(404, {
                    message: "User not found",
                })
            } else {
                response = lambdaResponse(200, {
                    message: "User logged in!",
                });
            }
        }
    });

    if (cb) {
        cb(null, response);
    }
}