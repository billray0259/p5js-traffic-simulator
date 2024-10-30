class Point {
    constructor(x, y, userData = null) {
        this.x = x;
        this.y = y;
        this.userData = userData;
    }
}

class Rectangle {
    constructor(x, y, w, h) {
        this.x = x; // Center x
        this.y = y; // Center y
        this.w = w; // Half-width
        this.h = h; // Half-height
    }

    contains(point) {
        return (point.x >= this.x - this.w &&
                point.x < this.x + this.w &&
                point.y >= this.y - this.h &&
                point.y < this.y + this.h);
    }

    intersects(range) {
        return !(range.x - range.w > this.x + this.w ||
                 range.x + range.w < this.x - this.w ||
                 range.y - range.h > this.y + this.h ||
                 range.y + range.h < this.y - this.h);
    }
}

class Quadtree {
    constructor(boundary, capacity) {
        this.boundary = boundary; // Rectangle
        this.capacity = capacity; // Maximum points per quadrant
        this.points = [];
        this.divided = false;
    }

    subdivide() {
        const { x, y, w, h } = this.boundary;
        const ne = new Rectangle(x + w / 2, y - h / 2, w / 2, h / 2);
        this.northeast = new Quadtree(ne, this.capacity);
        const nw = new Rectangle(x - w / 2, y - h / 2, w / 2, h / 2);
        this.northwest = new Quadtree(nw, this.capacity);
        const se = new Rectangle(x + w / 2, y + h / 2, w / 2, h / 2);
        this.southeast = new Quadtree(se, this.capacity);
        const sw = new Rectangle(x - w / 2, y + h / 2, w / 2, h / 2);
        this.southwest = new Quadtree(sw, this.capacity);
        this.divided = true;
    }

    insert(point) {
        if (!this.boundary.contains(point)) {
            return false;
        }

        if (this.points.length < this.capacity) {
            this.points.push(point);
            return true;
        } else {
            if (!this.divided) {
                this.subdivide();
            }

            if (this.northeast.insert(point)) return true;
            if (this.northwest.insert(point)) return true;
            if (this.southeast.insert(point)) return true;
            if (this.southwest.insert(point)) return true;
        }
    }

    query(range, found = []) {
        if (!this.boundary.intersects(range)) {
            return found;
        } else {
            for (let p of this.points) {
                if (range.contains(p)) {
                    found.push(p);
                }
            }
            if (this.divided) {
                this.northwest.query(range, found);
                this.northeast.query(range, found);
                this.southwest.query(range, found);
                this.southeast.query(range, found);
            }
            return found;
        }
    }

    clear() {
        this.points = [];
        if (this.divided) {
            this.northwest.clear();
            this.northeast.clear();
            this.southwest.clear();
            this.southeast.clear();
            this.divided = false;
        }
    }
}

export { Quadtree, Rectangle, Point };
