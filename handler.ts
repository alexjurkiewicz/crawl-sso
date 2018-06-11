import { APIGatewayEvent, Callback, Context, Handler } from 'aws-lambda';
import DynamoDB = require('aws-sdk/clients/dynamodb');

const USERS_TABLE = process.env.USERS_TABLE as string;

var dynamodb = new DynamoDB();

interface LambdaResponse {
    statusCode: number,
    body: string,
}

const lambdaResponse = (code: number, body: object) => {
    return {
        'statusCode': code,
        'body': JSON.stringify(body),
    } as LambdaResponse;
}

const getUser = (username: string) => {
    let params = {
        ExpressionAttributeValues: {
            ":v1": {
                S: username
            }
        },
        KeyConditionExpression: "username = :v1",
        TableName: USERS_TABLE,
    };
    dynamodb.query(params, function(err, data) {
        if (err) {
            throw err;
        } else {
            // We know DynamoDB will always return an array for us here
            if (data!.Items!.length === 0) {
                return null;
            } else {
                console.log("Found user");
                return (data.Items as DynamoDB.AttributeMap[])[0];
            }
        }
    });
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

export const registerUser: Handler = (event: APIGatewayEvent, context: Context, cb?: Callback) => {
    let response = {};

    const user = getUser('chequers');
    if (user) {
        return cb && cb(null, lambdaResponse(400, {
            "message": "User already exists"
        }));
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
                S: "qwerty"
            }
        },
        TableName: USERS_TABLE,
    };
    dynamodb.putItem(dynamo_item, (err, data) => {
        if (err) {
            console.log(err, err.stack);
            return cb && cb(null, lambdaResponse(400, {
                message: "Failed to add user",
                error: err,
            }));
        } else {
            console.log("Added user");
            return cb && cb(null, lambdaResponse(200, {
                message: "Added user",
                user: { "user": "TBD" }
            }));
        }
    });

    if (cb) {
        cb(null, response);
    }
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
            console.log(err, err.stack);
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