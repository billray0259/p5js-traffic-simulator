'use strict';

let dt = 1 / 30; // Time step in seconds
let cars = [];
let nodes = [];

// Camera control variables
let camX = 0;
let camY = 0;
let camZoom = 1;

// Scaling factor: pixels per meter
const pixelsPerMeter = 10; // 10 pixels represent 1 meter

let lastCarExitFrame = 0;
let carsPerMinute = 0;
let timeSinceLastNormalCar = 0;
let timeSinceLastMergerCar = 0;

function angleTowards(position, target) {
    return atan2(target.y - position.y, target.x - position.x);
}

class Car {
    constructor(x, y, acceleration, rotationalVelocity, targetSpeed) {
        this.position = createVector(x, y); // Position in meters
        this.velocity = createVector(0, 0); // Velocity in meters per second
        this.acceleration = acceleration; // Acceleration in meters per second squared
        this.rotationalVelocity = rotationalVelocity; // Rotational velocity in radians per second
        this.targetSpeed = targetSpeed; // Target speed in meters per second

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

    getNextCarDistance() {
        let rayOrigin = p5.Vector.add(this.position, p5.Vector.fromAngle(this.theta).setMag(this.width / 2));
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

    update() {
        if (!this.isFinished) {
            this.updateTargetNode();
            this.updateSteering();
            this.updateSpeed();
            this.updatePosition();
            this.checkIfFinished();
        }
    }

    updateTargetNode() {
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

    updateSpeed() {
        // Collision avoidance using getNextCarDistance()
        let distanceToNextCar = this.getNextCarDistance();
        let stopDistance = this.width * 0.5 + 1; // Stop distance in meters
        let brakingDistance = stopDistance + (this.velocity.mag() * this.velocity.mag()) / (2 * this.acceleration); // Threshold distance in meters
        let desiredSpeed = this.targetSpeed;

        if (distanceToNextCar < brakingDistance && distanceToNextCar > stopDistance) {
            // Slow down proportionally to the distance to the next car
            desiredSpeed = map(
                distanceToNextCar,
                0,
                brakingDistance,
                0,
                this.targetSpeed
            );
            desiredSpeed = constrain(desiredSpeed, 0, this.targetSpeed);
        } else if (distanceToNextCar == stopDistance) {
            // Stop the car
            desiredSpeed = 0;
        } else if (distanceToNextCar < stopDistance) {
            // Reverse if too close to the next car
            desiredSpeed = -this.targetSpeed;
        }

        // Impart a little bit of drag on the car
        this.velocity.mult(0.99);

        // Adjust current speed towards desired speed
        let currentSpeed = this.velocity.mag();

        if (currentSpeed < desiredSpeed) {
            // Accelerate
            currentSpeed += this.acceleration * dt;
            this.lastAcceleration = this.acceleration;
            currentSpeed = min(currentSpeed, desiredSpeed);
        } else {
            // Decelerate
            currentSpeed -= 3 * this.acceleration * dt;
            this.lastAcceleration = -this.acceleration;
            currentSpeed = max(currentSpeed, desiredSpeed);
        }

        // Update velocity based on current speed and heading
        this.velocity = p5.Vector.fromAngle(this.theta).setMag(currentSpeed);
    }

    updatePosition() {
        let deltaPos = p5.Vector.mult(this.velocity, dt);
        this.position.add(deltaPos);
    }

    checkIfFinished() {
        // Check if reached the target node
        if (this.targetNode != null && p5.Vector.dist(this.position, this.targetNode.position) < 2) {
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
        let currentSpeed = this.velocity.mag();
        if (currentSpeed < this.targetSpeed / 10) {
            speedColor = color(200, 0, 0); // Red color for stopped cars
        } else if (currentSpeed < this.targetSpeed / 2) {
            let orangeColor = color(255, 100, 0); // Orange color for medium speed cars
            let yellowColor = color(255, 200, 0); // Yellow color for slow cars
            let transition = map(currentSpeed, this.targetSpeed / 10, this.targetSpeed / 2, 0, 1);
            speedColor = lerpColor(orangeColor, yellowColor, transition);
        } else {
            let yellowColor = color(255, 200, 0); // Yellow color for slow cars
            let blueColor = color(50, 50, 255); // Blue color for fast cars
            let transition = map(currentSpeed, this.targetSpeed / 2, this.targetSpeed, 0, 1);
            speedColor = lerpColor(yellowColor, blueColor, transition);
        }
        fill(speedColor);
        let bodyWidth = this.width * pixelsPerMeter;
        let bodyHeight = this.height * pixelsPerMeter;
        rect(0, 0, bodyWidth, bodyHeight, bodyHeight * 0.2); // Rounded corners

        let wheelRadius = (this.height * 0.4) * pixelsPerMeter;

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
        let taillightColor = this.lastAcceleration >= 0 ? color(150, 50, 50) : color(255, 20, 20);
        fill(taillightColor);
        let taillightSize = this.lastAcceleration >= 0 ? headlightSize : headlightSize * 2;
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
            let rayEnd = p5.Vector.add(this.ray.origin, p5.Vector.mult(this.ray.direction, this.ray.distance));
            line(
                this.ray.origin.x * pixelsPerMeter,
                this.ray.origin.y * pixelsPerMeter,
                rayEnd.x * pixelsPerMeter,
                rayEnd.y * pixelsPerMeter
            );
        }
    }
}

class RoadNode {
    constructor(x, y) {
        this.position = createVector(x, y); // Position in meters
        this.next = null;
        this.previous = null;
        this.roadWidth = 6; // Width of the road in meters
        this.shoulderWidth = 1; // Width of the shoulder in meters
    }

    draw() {
        if (this.next != null) {
            push();
            // Calculate positions and transformations
            let startPos = createVector(
                this.position.x * pixelsPerMeter,
                this.position.y * pixelsPerMeter
            );
            let endPos = createVector(
                this.next.position.x * pixelsPerMeter,
                this.next.position.y * pixelsPerMeter
            );
            let direction = p5.Vector.sub(endPos, startPos);
            let angle = direction.heading();
            let distance = direction.mag();

            translate(startPos.x, startPos.y);
            rotate(angle);
            rectMode(CORNER);

            // Draw road shoulders
            noStroke();
            fill(80, 80, 80); // Dark gray for shoulders
            rect(
                0,
                - (this.roadWidth / 2 + this.shoulderWidth) * pixelsPerMeter,
                distance,
                this.shoulderWidth * pixelsPerMeter
            );
            rect(
                0,
                (this.roadWidth / 2) * pixelsPerMeter,
                distance,
                this.shoulderWidth * pixelsPerMeter
            );

            // Draw road surface
            fill(50); // Darker gray for road
            rect(
                0,
                -this.roadWidth * pixelsPerMeter / 2,
                distance,
                this.roadWidth * pixelsPerMeter
            );

            pop();
        }
    }
}

function setup() {
    frameRate(40);
    createCanvas(1430, 750);

    // Create a straight road with 12 nodes
    for (let i = 0; i < 12; i++) {
        let x = i * 100; // X position in meters
        let y = 0; // Y position in meters
        let node = new RoadNode(x, y); // Positions in meters
        nodes.push(node);
        if (i > 0) {
            nodes[i - 1].next = node;
            node.previous = nodes[i - 1];
        }
    }
}

function addCars() {
    let acceleration = 15;
    let rotationalVelocity = 10;
    let targetSpeed = 33.5;

    let mergersPerSecond = 10;
    let normalCarsPerSecond = 10;

    if (timeSinceLastMergerCar >= 1 / mergersPerSecond) {
        // Add merger car
        let x = int(random(0, 5)) * 200; // Random x position between 0 and 800 meters
        let y = 15; // Y position for mergers
        let isCarAlreadyThere = cars.some(car => p5.Vector.dist(car.position, createVector(x, y)) < 10);
        if (!isCarAlreadyThere) {
            let car = new Car(x, y, acceleration, rotationalVelocity, targetSpeed);
            cars.push(car);
        }
        timeSinceLastMergerCar = 0;
    }

    if (timeSinceLastNormalCar >= 1 / normalCarsPerSecond) {
        // Add normal car
        let x = nodes[0].position.x - 10; // X position 10 meters behind the first node
        let y = 0; // Y position in meters
        let isCarAlreadyThere = cars.some(car => p5.Vector.dist(car.position, createVector(x, y)) < 10);
        if (!isCarAlreadyThere) {
            let car = new Car(x, y, acceleration, rotationalVelocity, targetSpeed);
            cars.push(car);
        }
        timeSinceLastNormalCar = 0;
    }
}

function drawHUD() {
    // Draw the camera position and zoom level
    push();
    fill(255);
    noStroke();
    text("Camera position: (" + camX.toFixed(2) + ", " + camY.toFixed(2) + ")", 10, 20);
    text("Camera zoom: " + camZoom.toFixed(2), 10, 40);
    text("Number of cars: " + cars.length, 10, 60);
    text("Frame rate: ~" + (Math.round(frameRate() / 5) * 5).toFixed(0), 10, 80);
    text("Car exit rate: " + carsPerMinute.toFixed(0) + " cars/min", 10, 100);
    pop();
}

function draw() {
    // Background color (grass)
    background(100, 150, 50);

    // Apply camera transformations
    push();
    translate(width / 2, height / 2);
    scale(camZoom);
    translate(-camX * pixelsPerMeter, -camY * pixelsPerMeter);

    // Draw the road nodes
    for (let node of nodes) {
        node.draw();
    }

    // Update and draw the cars
    for (let car of cars) {
        car.update();
    }

    // Remove finished cars and update exit statistics
    cars = cars.filter(car => {
        if (car.isFinished) {
            let carExitDifference = car.exitFrame - lastCarExitFrame;
            lastCarExitFrame = car.exitFrame;
            let gameSecondsBetweenCarExits = carExitDifference * dt;
            let newCarsPerMinute = (1 / gameSecondsBetweenCarExits) * 60;
            carsPerMinute = carsPerMinute * 0.7 + newCarsPerMinute * 0.3;
            return false; // Remove car from array
        }
        return true; // Keep car in array
    });

    // Draw remaining cars
    for (let car of cars) {
        car.draw();
    }

    pop();

    // Update time counters
    timeSinceLastNormalCar += dt;
    timeSinceLastMergerCar += dt;

    if (cars.length < 150) {
        addCars();
    }

    drawHUD();
}

// Mouse drag to pan the camera (in meters)
function mouseDragged() {
    camX -= (movedX / camZoom) / pixelsPerMeter;
    camY -= (movedY / camZoom) / pixelsPerMeter;
}

// Mouse wheel to zoom in and out
function mouseWheel(event) {
    let zoomFactor = 1.05;
    if (event.deltaY > 0) {
        camZoom /= zoomFactor;
    } else {
        camZoom *= zoomFactor;
    }
    return false; // Prevent default scrolling behavior
}