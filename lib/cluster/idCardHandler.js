/*
 * Kuzzle, a backend software, self-hostable and ready to use
 * to power modern apps
 *
 * Copyright 2015-2020 Kuzzle
 * mailto: support AT kuzzle.io
 * website: http://kuzzle.io
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const nameGenerator = require('../util/name-generator');

const REDIS_PREFIX = '{cluster/node}/';

/**
 * @typedef {IdCard}
 */
class IdCard {
  /**
   * @param {Object} obj - contains the ID card description
   * @param {string} obj.id - node identifier
   * @param {string} obj.ip - node IP address
   * @param {Number} obj.birthdate - node creation timestamp
   * @param {Array.<string>} obj.topology - node's known topology
   */
  constructor (obj) {
    this.id = obj.id;
    this.ip = obj.ip;
    this.birthdate = obj.birthdate;
    this.topology = new Set(obj.topology);
  }

  serialize () {
    return JSON.stringify({
      birthdate: this.birthdate,
      id: this.id,
      ip: this.ip,
      topology: Array.from(this.topology),
    });
  }

  static unserialize (value) {
    return new IdCard(JSON.parse(value));
  }
}

/**
 * Handles the ID Key stored in Redis, holding node information
 */
class ClusterIdCardHandler {
  constructor (ip, refreshDelay) {
    this.idCard = null;
    this.ip = ip;
    this.refreshDelay = refreshDelay;
    this.refreshTimer = null;

    // Flag to prevent updating the id card if it has been disposed.
    // Prevents race condition if a topology update occurs at the same time as
    // the id card is been disposed because the node is evicting itself from the
    // cluster
    this.disposed = false;
  }

  /**
   * Generates and reserves a unique ID for this node instance.
   * Makes sure that the ID is not already taken by another node instance.
   *
   * @return {string} Returns the generated node ID
   */
  async createIdCard () {
    let reserved;

    do {
      this.nodeId = nameGenerator();
      this.nodeIdKey = `${REDIS_PREFIX}${this.nodeId}`;
      this.idCard = new IdCard({
        birthdate: Date.now(),
        id: this.nodeId,
        ip: this.ip,
        topology: [],
      });

      reserved = await global.kuzzle.ask(
        'core:cache:internal:store',
        this.nodeIdKey,
        this.idCard.serialize(),
        { onlyIfNew: true, ttl: this.refreshDelay * 1.5 });
    } while (!reserved);

    this.refreshTimer = setInterval(
      async () => {
        if (!this.disposed) {
          await global.kuzzle.ask(
            'core:cache:internal:pexpire',
            this.nodeIdKey,
            this.refreshDelay * 1.5);
        }
      },
      this.refreshDelay);

    return this.nodeId;
  }

  async dispose () {
    this.disposed = true;
    clearInterval(this.refreshTimer);
    await global.kuzzle.ask('core:cache:internal:del', this.nodeIdKey);
  }

  /**
   * Retrieves the ID cards from other nodes
   * @return {Array.<IdCard>}
   */
  async getRemoteIdCards () {
    const result = [];

    let keys = await global.kuzzle.ask(
      'core:cache:internal:searchKeys',
      `${REDIS_PREFIX}*`);

    keys = keys.filter(nodeIdKey => nodeIdKey !== this.nodeIdKey);

    if (keys.length === 0) {
      return result;
    }

    const values = await global.kuzzle.ask('core:cache:internal:mget', keys);

    for (let i = 0; i < keys.length; i++) {
      // filter keys that might have expired between the key search and their
      // values retrieval
      if (values[i] !== null) {
        result.push(IdCard.unserialize(values[i]));
      }
    }

    return result;
  }

  async addNode (id) {
    if (this.disposed || this.idCard.topology.has(id)) {
      return;
    }

    this.idCard.topology.add(id);

    await global.kuzzle.ask(
      'core:cache:internal:store',
      this.nodeIdKey,
      this.idCard.serialize(),
      { ttl: this.refreshDelay * 1.5 });
  }

  async removeNode (id) {
    if (!this.disposed && this.idCard.topology.delete(id)) {
      await global.kuzzle.ask(
        'core:cache:internal:store',
        this.nodeIdKey,
        this.idCard.serialize(),
        { ttl: this.refreshDelay * 1.5 });
    }
  }
}

module.exports = ClusterIdCardHandler;