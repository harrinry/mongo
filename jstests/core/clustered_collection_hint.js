/**
 * Tests that a collection with a clustered index can use and interpret a query hint.
 * @tags: [
 *   requires_fcv_52,
 *   # Does not support sharding
 *   assumes_against_mongod_not_mongos,
 *   assumes_unsharded_collection,
 * ]
 */
(function() {
"use strict";
load("jstests/libs/clustered_collections/clustered_collection_util.js");
load("jstests/libs/clustered_collections/clustered_collection_hint_common.js");

if (ClusteredCollectionUtil.areClusteredIndexesEnabled(db.getMongo()) == false) {
    jsTestLog('Skipping test because the clustered indexes feature flag is disabled');
    return;
}

const replicatedDB = db.getSiblingDB(jsTestName());
const collName = "coll";
const replicatedColl = replicatedDB[collName];

testClusteredCollectionHint(replicatedColl, {_id: 1}, "_id_");
})();
