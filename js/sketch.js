// js/sketch.js
'use strict';

// Import classes and functions
import { Car } from './car.js';
import { RoadNode } from './roadnode.js';
import { angleTowards } from './utils.js';
import { pixelsPerMeter, dt } from './constants.js';
import { Quadtree, Rectangle, Point } from './quadtree.js';

// Global variables
let cars = [];
let nodes = [];

// Camera control variables
let camX = 0;
let camY = 0;
let camZoom = 1;

let lastCarExitFrame = 0;
let carsPerMinute = 0;
let timeSinceLastNormalCar = 0;
let timeSinceLastMergerCar = 0;

// Declare quadtree globally
let quadtree;

window.setup = function () {
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

    // Initialize quadtree with appropriate boundaries
    // Assuming the canvas represents a certain area in meters
    const boundary = new Rectangle(715, 375, 715, 375); // Center at (715, 375) with width and height
    quadtree = new Quadtree(boundary, 4); // Capacity set to 4
}

function addCars() {
    let acceleration = 20;
    let rotationalVelocity = 10;
    let targetSpeed = 33.5;
    let maxJerk = 200;

    let mergersPerSecond = 10;
    let normalCarsPerSecond = 10;

    if (timeSinceLastMergerCar >= 1 / mergersPerSecond) {
        // Add merger car
        let x = int(random(0, 5)) * 200; // Random x position between 0 and 800 meters
        let y = 15; // Y position for mergers
        let isCarAlreadyThere = cars.some(car => p5.Vector.dist(car.position, createVector(x, y)) < 10);
        if (!isCarAlreadyThere) {
            let car = new Car(x, y, acceleration, rotationalVelocity, targetSpeed, maxJerk);
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
            let car = new Car(x, y, acceleration, rotationalVelocity, targetSpeed, maxJerk);
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

window.draw = function () {
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

    // Clear and rebuild quadtree each frame
    quadtree.clear();
    for (let car of cars) {
        let point = new Point(car.position.x, car.position.y, car);
        quadtree.insert(point);
    }

    // Update and draw the cars using nearby cars from quadtree
    for (let car of cars) {
        // Define the query range (e.g., 100 meters around the car)
        const range = new Rectangle(car.position.x, car.position.y, 100, 100);
        const nearbyPoints = quadtree.query(range);
        const nearbyCars = nearbyPoints.map(p => p.userData);
        car.updateInternal(nearbyCars, nodes);
    }

    for (let car of cars) {
        car.updateExternal();
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
window.mouseDragged = function () {
    camX -= (movedX / camZoom) / pixelsPerMeter;
    camY -= (movedY / camZoom) / pixelsPerMeter;
}

// Mouse wheel to zoom in and out
window.mouseWheel = function (event) {
    let zoomFactor = 1.05;
    if (event.deltaY > 0) {
        camZoom /= zoomFactor;
    } else {
        camZoom *= zoomFactor;
    }
    return false; // Prevent default scrolling behavior
}