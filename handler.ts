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
    // Load user details
    let body = JSON.parse(event['body'] as string);
    if (!('username' in body) || !('password' in body) || !('email' in body)) {
        return lambdaResponse(400, {
            "message": "Registration requires username, password, and email."
        });
    }
    const username = body['username'];
    const user = await getUser(username);
    const password = body['password'];
    const password_hash = await kmsEncrypt(password);
    const email = body['email'];

    if (user) {
        console.log("User already exists. Reporting this.")
        return lambdaResponse(400, {
            "message": "User already exists"
        });
    }

    const dynamo_item = {
        Item: {
            "username": {
                S: username
            },
            "email": {
                S: email
            },
            "password": {
                // This is raw bytes
                B: password_hash
            }
        },
        TableName: USERS_TABLE,
    };
    return await dynamodb.putItem(dynamo_item).promise()
        .then((data) => {
            console.log("Generating success response");
            return lambdaResponse(200, {
                message: "Added user"
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
}

exports.loginUser = async (event: APIGatewayEvent) => {
    // Load user details
    let body = JSON.parse(event['body'] as string);
    if (!('username' in body) || !('password' in body)) {
        return lambdaResponse(400, {
            "message": "Login requires username, and password."
        });
    }
    const username = body['username'];
    const password = body['password'];
    const password_hash = await kmsEncrypt(password);

    let params = {
        ExpressionAttributeValues: {
            ":v1": {
                S: username
            }
        },
        KeyConditionExpression: "username = :v1",
        TableName: USERS_TABLE,
    };
    return dynamodb.query(params).promise()
        .then((data) => {
            if (!data.Items || data.Items.length === 0) {
                return lambdaResponse(404, {
                    message: "User not found",
                })
            } else {
                const player = data.Items[0];
                if (player["password"]["B"] === password_hash) {
                    return lambdaResponse(200, {
                        message: "User logged in!",
                        player: player,
                    });
                } else {
                    return lambdaResponse(403, {
                        message: "Login failed",
                        player: player,
                        hash: password_hash,
                    });
                }
            }
            
        })
        .catch((err) => {
            return lambdaResponse(400, {
                message: "Bad login request",
                error: err,
            });
        });
}