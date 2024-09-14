// js/roadnode.js
'use strict';

import { pixelsPerMeter } from './constants.js';

export class RoadNode {
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