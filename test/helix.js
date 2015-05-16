var run = require('../helix');
var assert = require("assert");

var fitnessScenario = {
  startingPosition() {
    return {
      x: 100,
      y: 100,
    };
  },

  expectedPositions: [
    {
      frame: 60,
      x: 1000,
      y: -100,
    },
    {
      frame: 120,
      x: 1300,
      y: 1000,
    },
  ],

  fitness(expectedPosition, entity) {
    var distance = {
      x: Math.abs(expectedPosition.x - entity.x),
      y: Math.abs(expectedPosition.y - entity.y),
    }

    return 1000 - (distance.x + distance.y);
  }
};

var api = function(entity) {
  return {
    move(coordinates) {
      entity.x += coordinates.x;
      entity.y += coordinates.y;
    }
  }
}


describe('Helix', () => {
  describe('#run', () => {
    it('returns an array of entities with fitnesses', () => {
      var results = run(fitnessScenario, api);
      assert(!isNaN(results[0].fitness));
    });
  });
});
