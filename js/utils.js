// js/utils.js
'use strict';

export function angleTowards(position, target) {
    return atan2(target.y - position.y, target.x - position.x);
}