var breed = require('./app/breeding');
var Seeder = require('./app/seeder');
var Entity = require('./app/entity');
var simulateWorld = require('./app/simulator');

var _ = require('lodash');

var eachSlice = function(array, sizeOfSlice) {
  return _.chain(array).groupBy((item, index) => {
    return Math.floor(index / sizeOfSlice);
  }).toArray().value();
};

var mean = function(array) {
  return _.sum(array) / array.length;
}



function run(fitnessScenario, entityApi, generations=500, population=32) {
  var newbornIndividuals = [];
  var entities;

  var apiDescription = {
    getPosition: {
      returns: {x: 0, y: 0},
    }
  }// TODO - fix this hack
 
  _.times(generations, function(generation) {
    newbornIndividuals = newbornIndividuals.concat(Seeder.make(apiDescription, population - newbornIndividuals.length));

    entities = newbornIndividuals
      .map(individual => new Entity(individual, fitnessScenario.startingPosition()));

    var currentFrame = 0;
    fitnessScenario.expectedPositions.forEach(expectedPosition => {
      entities.forEach(entity => simulateWorld(entity, expectedPosition.frame - currentFrame, entityApi));

      currentFrame += expectedPosition.frame;

      entities.forEach(entity => {
        entity.fitnessPerPosition.push(fitnessScenario.fitness(expectedPosition, entity));
      });
    });

    entities.forEach(entity => {
      entity.fitness = mean(entity.fitnessPerPosition);
    });

    var fittestIndividuals = entities
      .sort((a, b) => b.fitness - a.fitness)
      .map(e => e.individual)
      .slice(0, population / 2);

    var breedingPairs = eachSlice(fittestIndividuals, 2)

    newbornIndividuals = _.flatten(breedingPairs.map(pair => breed.apply(this, pair)));
  })

  return entities.sort((a, b) => b.fitness - a.fitness);
}

module.exports = run;
