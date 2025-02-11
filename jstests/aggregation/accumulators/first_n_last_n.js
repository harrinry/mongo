/**
 * Basic tests for the $firstN/$lastN accumulators.
 */
(function() {
"use strict";

load("jstests/aggregation/extras/utils.js");

const coll = db[jsTestName()];
coll.drop();

const largestInt =
    NumberDecimal("9223372036854775807");  // This is max int64 which is supported as N.
const largestIntPlus1 = NumberDecimal("9223372036854775808");  // Adding 1 puts it over the edge.

// Basic correctness tests.
let docs = [];
const defaultN = 3;
const kMaxSales = 20;
let expectedFirstThree = [];
let expectedLastThree = [];
let expectedAllResults = [];
for (const states
         of [{state: 'AZ', sales: 3}, {state: 'CA', sales: 2}, {state: 'NY', sales: kMaxSales}]) {
    let allResults = [];
    let firstThree = [];
    let lastThree = [];
    const state = states['state'];
    const sales = states['sales'];
    for (let i = 0; i < kMaxSales; ++i) {
        const salesAmt = i * 10;
        if (i < sales) {
            docs.push({state: state, sales: salesAmt});

            // First N candidate.
            if (i < defaultN) {
                firstThree.push(salesAmt);
            }

            if (i + defaultN >= sales) {
                lastThree.push(salesAmt);
            }
            allResults.push(salesAmt);
        }
    }
    expectedFirstThree.push({_id: state, sales: firstThree});
    expectedLastThree.push({_id: state, sales: lastThree});
    expectedAllResults.push({_id: state, sales: allResults});
}

assert.commandWorked(coll.insert(docs));

function runFirstLastN(n, expectedFirstNResults, expectedLastNResults) {
    const actualFirstNResults =
        coll.aggregate([
                {$sort: {_id: 1}},
                {$group: {_id: '$state', sales: {$firstN: {input: "$sales", n: n}}}},
            ])
            .toArray();

    const actualLastNResults =
        coll.aggregate([
                {$sort: {_id: 1}},
                {$group: {_id: '$state', sales: {$lastN: {input: "$sales", n: n}}}},
            ])
            .toArray();

    // As these are unordered operators, we need to ensure we can deterministically test the values
    // returned by firstN/lastN. As the output is not guaranteed to be in order, arrayEq is used
    // instead.
    arrayEq(expectedFirstNResults, actualFirstNResults);
    arrayEq(expectedLastNResults, actualLastNResults);

    // Verify that an index on {_id: 1, sales: -1} will produce the expected results.
    const idxSpec = {_id: 1, sales: -1};
    assert.commandWorked(coll.createIndex(idxSpec));

    const indexedFirstNResults =
        coll.aggregate(
                [
                    {$sort: {_id: 1}},
                    {$group: {_id: '$state', sales: {$firstN: {input: "$sales", n: n}}}},
                    {$sort: {_id: 1}},
                ],
                {hint: idxSpec})
            .toArray();
    assert.eq(expectedFirstNResults, indexedFirstNResults);

    const indexedLastNResults =
        coll.aggregate(
                [
                    {$sort: {_id: 1}},
                    {$group: {_id: '$state', sales: {$lastN: {input: "$sales", n: n}}}},
                    {$sort: {_id: 1}},
                ],
                {hint: idxSpec})
            .toArray();
    assert.eq(expectedLastNResults, indexedLastNResults);
}

runFirstLastN(defaultN, expectedFirstThree, expectedLastThree);

// Verify that 'n' is allowed to be the max signed 64 bit int and returns all values.
runFirstLastN(largestInt, expectedAllResults, expectedAllResults);

// Reject non-integral values of n.
assert.commandFailedWithCode(coll.runCommand("aggregate", {
    pipeline: [{$group: {_id: {'st': '$state'}, sales: {$firstN: {input: '$sales', n: 'string'}}}}],
    cursor: {}
}),
                             5787902);

assert.commandFailedWithCode(coll.runCommand("aggregate", {
    pipeline: [{$group: {_id: {'st': '$state'}, sales: {$firstN: {input: '$sales', n: 3.2}}}}],
    cursor: {}
}),
                             5787903);

assert.commandFailedWithCode(coll.runCommand("aggregate", {
    pipeline: [{$group: {_id: {'st': '$state'}, sales: {$firstN: {input: '$sales', n: -1}}}}],
    cursor: {}
}),
                             5787908);

// Verify that 'n' cannot be greater than the largest signed 64 bit int.
assert.commandFailedWithCode(coll.runCommand("aggregate", {
    pipeline: [
        {$group: {_id: {'st': '$state'}, sales: {$firstN: {input: '$sales', n: largestIntPlus1}}}}
    ],
    cursor: {}
}),
                             5787903);

// Reject invalid specifications.

// Extra fields
assert.commandFailedWithCode(coll.runCommand("aggregate", {
    pipeline: [{
        $group: {
            _id: {'st': '$state'},
            sales: {$firstN: {input: '$sales', n: 2, randomField: "randomArg"}}
        }
    }],
    cursor: {}
}),
                             5787901);

// Missing arguments.
assert.commandFailedWithCode(coll.runCommand("aggregate", {
    pipeline: [{$group: {_id: {'st': '$state'}, sales: {$firstN: {input: '$sales'}}}}],
    cursor: {}
}),
                             5787906);

assert.commandFailedWithCode(
    coll.runCommand(
        "aggregate",
        {pipeline: [{$group: {_id: {'st': '$state'}, sales: {$firstN: {n: 2}}}}], cursor: {}}),
    5787907);
})();