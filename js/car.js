// js/car.js
'use strict';

import { pixelsPerMeter, dt } from './constants.js';
import { angleTowards } from './utils.js';

export class Car {
    constructor(x, y, acceleration, rotationalVelocity, targetSpeed, maxJerk) {
        this.position = createVector(x, y); // Position in meters
        this.speed = 0; // Speed in meters per second
        this.acceleration = acceleration; // Maximum acceleration in meters per second squared
        this.rotationalVelocity = rotationalVelocity; // Rotational velocity in radians per second
        this.targetSpeed = targetSpeed; // Target speed in meters per second
        this.maxJerk = maxJerk; // Maximum rate of change of acceleration (jerk)
        this.currentAcceleration = 0; // Current acceleration in meters per second squared

        this.theta = 0; // Orientation angle in radians
        this.width = 4.5; // Car width in meters (approximate width of a car)
        this.height = 2; // Car height in meters
        this.targetNode = null;

        this.ray = null;
        this.lastAcceleration = 0;
        this.isFinished = false;
        this.exitFrame = null;
    }

    getBoundingBox() {
        let halfWidth = this.width / 2;
        let halfHeight = this.height / 2;
        let corners = [
            createVector(-halfWidth, -halfHeight),
            createVector(halfWidth, -halfHeight),
            createVector(halfWidth, halfHeight),
            createVector(-halfWidth, halfHeight)
        ];

        // Rotate and translate corners to world position
        let boundingBox = [];
        for (let corner of corners) {
            let rotatedCorner = p5.Vector.rotate(corner, this.theta);
            let worldCorner = p5.Vector.add(this.position, rotatedCorner);
            boundingBox.push(worldCorner);
        }

        return boundingBox;
    }

    getNextCarDistance(cars) {
        let rayOrigin = p5.Vector.add(
            this.position,
            p5.Vector.fromAngle(this.theta).setMag(this.width / 2)
        );
        let rayDir = p5.Vector.fromAngle(this.theta);
        let minDistance = Infinity;

        for (let otherCar of cars) {
            if (otherCar !== this) {
                let boundingBox = otherCar.getBoundingBox();

                // Check each edge of the bounding box
                for (let i = 0; i < boundingBox.length; i++) {
                    let p1 = boundingBox[i];
                    let p2 = boundingBox[(i + 1) % boundingBox.length];

                    let intersection = this.raySegmentIntersection(rayOrigin, rayDir, p1, p2);

                    if (intersection.intersects) {
                        if (intersection.t >= 0 && intersection.u >= 0 && intersection.u <= 1) {
                            if (intersection.t < minDistance) {
                                minDistance = intersection.t;
                                this.ray = {
                                    origin: rayOrigin,
                                    direction: rayDir,
                                    distance: minDistance
                                };
                            }
                        }
                    }
                }
            }
        }

        return minDistance;
    }

    raySegmentIntersection(rayOrigin, rayDir, p1, p2) {
        // Ray: r(t) = rayOrigin + t * rayDir, t >= 0
        // Segment: s(u) = p1 + u * (p2 - p1), 0 <= u <= 1
        let v1 = rayOrigin.copy().sub(p1);
        let v2 = p2.copy().sub(p1);
        let v3 = createVector(-rayDir.y, rayDir.x);

        let dot = v2.dot(v3);

        if (abs(dot) < 0.000001) {
            // Parallel lines
            return { intersects: false };
        }

        let t = v2.cross(v1).z / dot;
        let u = v1.dot(v3) / dot;

        return { intersects: true, t: t, u: u };
    }

    updateInternal(cars, nodes) {
        if (!this.isFinished) {
            this.updateTargetNode(nodes);
            this.updateSteering();
            this.updateSpeed(cars);
            this.checkIfFinished();
        }
    }

    updateExternal() {
        this.updatePosition();
    }

    updateTargetNode(nodes) {
        if (this.targetNode == null) {
            // Find the closest starting node
            let closestNode = null;
            let closestDistance = Infinity;
            for (let node of nodes) {
                if (node.position.x < this.position.x - 10) {
                    continue; // Skip nodes behind the car
                }
                let distance = p5.Vector.dist(this.position, node.position);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestNode = node;
                }
            }
            if (closestNode) {
                this.targetNode = closestNode.next;
            }
        }
    }

    updateSteering() {
        if (this.targetNode != null) {
            let angle = angleTowards(this.position, this.targetNode.position);
            let angleDifference = angle - this.theta;
            angleDifference = (angleDifference + PI) % TWO_PI - PI; // Normalize to [-PI, PI]
            this.theta += angleDifference * this.rotationalVelocity * dt;
        }
    }

    updateSpeed(cars) {
        // Collision avoidance using getNextCarDistance()
        let distanceToNextCar = this.getNextCarDistance(cars);
        let stopDistance = this.width; // Stop distance in meters
        let brakingDistance =
            stopDistance + (this.speed * this.speed) / (2 * this.acceleration); // Threshold distance in meters
        let desiredSpeed = this.targetSpeed;

        if (distanceToNextCar < brakingDistance && distanceToNextCar > stopDistance) {
            // Slow down proportionally to the distance to the next car
            desiredSpeed = map(
                distanceToNextCar,
                stopDistance,
                brakingDistance,
                0,
                this.targetSpeed
            );
            desiredSpeed = constrain(desiredSpeed, 0, this.targetSpeed);
        } else if (distanceToNextCar <= stopDistance) {
            // Stop the car
            desiredSpeed = 0;
        }

        // Impart a little bit of drag on the car
        this.speed *= 0.99;

        // Adjust current speed towards desired speed using acceleration and jerk
        let currentSpeed = this.speed;
        let speedDifference = desiredSpeed - currentSpeed;

        // Compute desired acceleration needed to reach desired speed
        let desiredAcceleration = speedDifference / dt;

        // Limit desiredAcceleration to the car's capabilities
        let maxDeceleration = -3 * this.acceleration; // Negative value for deceleration
        desiredAcceleration = constrain(
            desiredAcceleration,
            maxDeceleration,
            this.acceleration
        );

        // Compute the difference between desired and current acceleration
        let accelerationDifference = desiredAcceleration - this.currentAcceleration;

        // Limit the rate of change of acceleration (jerk)
        let maxDeltaAcceleration = this.maxJerk * dt;
        accelerationDifference = constrain(
            accelerationDifference,
            -maxDeltaAcceleration,
            maxDeltaAcceleration
        );

        // Update currentAcceleration
        this.currentAcceleration += accelerationDifference;

        // Update lastAcceleration (for taillight display)
        this.lastAcceleration = this.currentAcceleration;

        // Update speed based on currentAcceleration
        let deltaSpeed = this.currentAcceleration * dt;
        this.speed += deltaSpeed;

        // Limit the speed to desiredSpeed (if overshooting)
        if ((desiredSpeed - currentSpeed) * (this.speed - desiredSpeed) > 0) {
            // If we've crossed over the desiredSpeed, set speed to desiredSpeed
            this.speed = desiredSpeed;
            this.currentAcceleration = 0; // Since we've reached desired speed
        }

        this.speed = constrain(this.speed, 0, this.targetSpeed);
    }

    updatePosition() {
        let deltaPos = p5.Vector.fromAngle(this.theta).setMag(this.speed * dt);
        this.position.add(deltaPos);
    }

    checkIfFinished() {
        // Check if reached the target node
        if (
            this.targetNode != null &&
            p5.Vector.dist(this.position, this.targetNode.position) < 2
        ) {
            if (this.targetNode.next == null) {
                // Mark the car as finished
                this.isFinished = true;
                this.exitFrame = frameCount;
            }
            this.targetNode = this.targetNode.next;
        }
    }

    draw() {
        push();
        // Convert position from meters to pixels
        translate(this.position.x * pixelsPerMeter, this.position.y * pixelsPerMeter);
        rotate(this.theta);

        // Set rect mode to center
        rectMode(CENTER);
        noStroke();

        // Car body
        let speedColor;
        let currentSpeed = this.speed;
        if (currentSpeed < this.targetSpeed / 10) {
            speedColor = color(200, 0, 0); // Red color for stopped cars
        } else if (currentSpeed < this.targetSpeed / 2) {
            let orangeColor = color(255, 100, 0); // Orange color for medium speed cars
            let yellowColor = color(255, 200, 0); // Yellow color for slow cars
            let transition = map(
                currentSpeed,
                this.targetSpeed / 10,
                this.targetSpeed / 2,
                0,
                1
            );
            speedColor = lerpColor(orangeColor, yellowColor, transition);
        } else {
            let yellowColor = color(255, 200, 0); // Yellow color for slow cars
            let blueColor = color(50, 50, 255); // Blue color for fast cars
            let transition = map(
                currentSpeed,
                this.targetSpeed / 2,
                this.targetSpeed,
                0,
                1
            );
            speedColor = lerpColor(yellowColor, blueColor, transition);
        }
        fill(speedColor);
        let bodyWidth = this.width * pixelsPerMeter;
        let bodyHeight = this.height * pixelsPerMeter;
        rect(0, 0, bodyWidth, bodyHeight, bodyHeight * 0.2); // Rounded corners

        let wheelRadius = this.height * 0.4 * pixelsPerMeter;

        // Headlights
        fill(255, 255, 255);
        let headlightSize = wheelRadius * 0.5;
        ellipse(
            bodyWidth / 2 + headlightSize * 0.3,
            -bodyHeight * 0.2,
            headlightSize,
            headlightSize
        );
        ellipse(
            bodyWidth / 2 + headlightSize * 0.3,
            bodyHeight * 0.2,
            headlightSize,
            headlightSize
        );

        // Tail lights
        let taillightColor =
            this.lastAcceleration >= 0 ? color(150, 50, 50) : color(255, 20, 20);
        fill(taillightColor);
        let taillightSize =
            this.lastAcceleration >= 0 ? headlightSize : headlightSize * 2;
        ellipse(
            -bodyWidth / 2 - taillightSize * 0.3,
            -bodyHeight * 0.25,
            taillightSize,
            taillightSize
        );
        ellipse(
            -bodyWidth / 2 - taillightSize * 0.3,
            bodyHeight * 0.25,
            taillightSize,
            taillightSize
        );

        pop();

        if (this.ray != null) {
            // Draw ray for collision avoidance
            stroke(255, 0, 0); // Red color
            strokeWeight(2);
            let rayEnd = p5.Vector.add(
                this.ray.origin,
                p5.Vector.mult(this.ray.direction, this.ray.distance)
            );
            line(
                this.ray.origin.x * pixelsPerMeter,
                this.ray.origin.y * pixelsPerMeter,
                rayEnd.x * pixelsPerMeter,
                rayEnd.y * pixelsPerMeter
            );
        }
    }
}