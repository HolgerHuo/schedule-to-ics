import { fetchBuilder, MemoryCache } from 'node-fetch-cache';

const fetch = fetchBuilder.withCache(new MemoryCache({ ttl: 3600000 }));

/**
 * parse remote json data with 1h ttl
 * 
 * @param {string} url destination url
 * @returns {Object} json data object
 */
export default async function fetchJson(url) {
    const response = await fetch(url);
    return response.json();
};