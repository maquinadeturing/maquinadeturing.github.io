var search_index = null;

document.addEventListener('DOMContentLoaded', function () {
    let search_form_element = document.querySelector('.search-form');
    let search_field_element = document.querySelector('.search-field');
    let search_results_element = document.querySelector('.search-results');
    let search_timeout = null;

    document.querySelector('.search-submit').addEventListener('click', async function (e) {
        e.preventDefault();
        submit_search();
    });

    search_field_element.addEventListener('input', function () {
        submit_search();
    });

    document.addEventListener('click', (event) => {
        if (!search_form_element.contains(event.target) && !search_results_element.contains(event.target)) {
            clear_search_results();
        }
    });

    search_field_element.addEventListener('focus', function () {
        submit_search();
    });

    function clear_search_results() {
        search_results_element.innerHTML = '';
        search_results_element.classList.add('hidden');
    }

    function submit_search() {
        var query = search_field_element.value;

        if (search_timeout) {
            clearTimeout(search_timeout);
        }
        search_timeout = setTimeout(async function () {
            clear_search_results();

            if (!query) {
                return;
            }

            let posts = await search_posts(query);

            if (posts.length == 0) {
                return;
            }

            posts.forEach((post_lang_map) => {
                if (post_lang_map.has(page_lang)) {
                    var post = post_lang_map.get(page_lang);
                    var other_langs = [];
                } else {
                    var post = Array.from(post_lang_map.values()).find((post) => site_languages.includes(post.lang));
                    var other_langs = Array.from(post_lang_map.keys()).filter((lang) => lang != post.lang);
                }

                let search_result_item = document.createElement('li');
                search_result_item.innerHTML = '<a href="' + post.url + '">' + post.title + '</a>';
                if (post.lang != page_lang) {
                    search_result_item.innerHTML += '<a href="' + post.url + '" class="box-shadow lang-code">' + post.lang + '</a>';
                }

                other_langs.forEach((lang) => {
                    search_result_item.innerHTML += '<a href="' + post_lang_map.get(lang).url + '" class="box-shadow lang-code">' + lang + '</a>';
                });

                search_results_element.appendChild(search_result_item);
            });

            search_results_element.classList.remove('hidden');
        }, 500);
    }
});

async function search_posts(query) {
    console.log("Searching for: '" + query + "'");

    let index = await get_search_index();
    let posts_results = new Map; // { uuid => { "lang" => ..., "title" => ..., "date" => ..., "url" => ..., "score" => ... }, ... }
    const words = get_ansi_words(query);

    const word_search = search_content_index(words, index.content_index);
    const title_index_search = search_title_index(words, index.title_index);
    const title_list_search = search_title_list(words, index.ansi_titles);

    console.log("Content index results: ", word_search);
    console.log("Title index results: ", title_index_search);
    console.log("Title list results: ", title_list_search);

    let combined_results = new Map;
    combined_results = new Map();

    for (const serach_result of [word_search, title_index_search, title_list_search]) {
        for (var [post_index, score] of serach_result) {
            if (combined_results.has(post_index)) {
                combined_results.set(post_index, combined_results.get(post_index) + score);
            } else {
                combined_results.set(post_index, score);
            }
        }
    }

    for (var [post_index, score] of combined_results) {
        let post = index_data.posts[post_index];

        if (!posts_results.has(post.uuid)) {
            posts_results.set(post.uuid, new Map);
        }

        posts_results.get(post.uuid).set(post.lang, {
            lang: post.lang,
            title: post.title,
            date: post.date,
            url: post.url,
            score: score
        });
    }

    console.log("Combined results: ", combined_results);

    return Array.from(posts_results.values()).sort((a, b) => {
        let score_a = Array.from(a.values()).map((post) => post.score).reduce((acc, score) => Math.max(acc, score), 0);
        let score_b = Array.from(b.values()).map((post) => post.score).reduce((acc, score) => Math.max(acc, score), 0);
        return score_b - score_a; // Descending order
    }).slice(0, 10);
}

async function get_search_index() {
    if (!search_index) {
        let response = await fetch("/search-index.json");
        if (!response.ok) {
            return null;
        }

        // The search index is a JSON file with the following structure:
        // {
        //     "index": {
        //         lang: [
        //             { word: [ [post_index, count], ... ], ... },
        //             ... ],
        //         ... },
        //     "posts": [
        //         { "url": ..., "title": ..., "date": ..., "lang": ..., "uuid": ... },
        //         ... ]
        // }
        index_data = await response.json();

        console.log("Search index loaded.");

        search_index = {
            "content_index": {}, // { lang: BKTree, ... }
            "title_index": new BKTree(levenshtein_distance), // BKTree
            "ansi_titles": [], // Title of each post with ANSI characters
        };
        for (let lang in index_data.index) {
            let tree = new BKTree(levenshtein_distance);
            Object.entries(index_data.index[lang]).forEach(([word, posts]) => {
                const ansi_word = get_ansi_word(word);
                tree.add(ansi_word, posts);
            });
            search_index.content_index[lang] = tree;
        }

        let title_words = new Map;

        for (let post_index = 0; post_index < index_data.posts.length; post_index++) {
            const post_title = index_data.posts[post_index].title;

            search_index.ansi_titles.push(to_ansi(post_title));

            const words = get_ansi_words(post_title);
            words.forEach((word) => {
                if (title_words.has(word)) {
                    title_words.get(word).push(post_index);
                } else {
                    title_words.set(word, [post_index]);
                }
            });
        }

        title_words.forEach((posts, word) => {
            search_index.title_index.add(word, posts);
        });
    }

    return search_index;
}

// Max distance for each word length
function get_distance(word) {
    return Math.max(Math.floor(word.length / 3), 1);
}

function get_letter_ansi_map() {
    const ansi_map = {
        'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
        'à': 'a', 'è': 'e', 'ì': 'i', 'ò': 'o', 'ù': 'u',
        'ä': 'a', 'ë': 'e', 'ï': 'i', 'ö': 'o', 'ü': 'u',
        'â': 'a', 'ê': 'e', 'î': 'i', 'ô': 'o', 'û': 'u',
        'ç': 'c', 'ñ': 'n',
        'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U',
        'À': 'A', 'È': 'E', 'Ì': 'I', 'Ò': 'O', 'Ù': 'U',
        'Ä': 'A', 'Ë': 'E', 'Ï': 'I', 'Ö': 'O', 'Ü': 'U',
        'Â': 'A', 'Ê': 'E', 'Î': 'I', 'Ô': 'O', 'Û': 'U',
        'Ç': 'C', 'Ñ': 'N'
    };
    return ansi_map;
}

function get_ansi_map() {
    const ansi_map = get_letter_ansi_map();
    const special_chars = {'·': ''};
    return { ...ansi_map, ...special_chars };
}

function to_ansi(str) {
    const ansi_map = get_letter_ansi_map();
    return str.replace(new RegExp(/./, 'g'), (char) => ansi_map[char] || char).toLowerCase();
}

function get_ansi_word(word) {
    const ansi_map = get_ansi_map();
    const special_chars = Object.keys(ansi_map).join('');
    const valid_chars = 'a-zA-Z0-9' + special_chars;
    return word.replace(new RegExp(`[^${valid_chars}]`, 'g'), '')
        .replace(new RegExp(/./, 'g'), (char) => ansi_map[char] || char)
        .toLowerCase();
}

function get_ansi_words(query) {
    const ansi_map = get_ansi_map();
    const special_chars = Object.keys(ansi_map).join('');
    const valid_chars = 'a-zA-Z0-9' + special_chars;
    words = new Set(query
        .replace(new RegExp(`[^${valid_chars}]`, 'g'), ' ')
        .replace(new RegExp(/./, 'g'), (char) => ansi_map[char] || char)
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length >= 2 && !(/^\d+$/.test(word))));
    return words;
}

function search_title_list(words, title_list) {
    let results = new Map; // { post_index: score, ... }
    for (let i = 0; i < title_list.length; i++) {
        let title = title_list[i];
        let score = 0;
        words.forEach(function (word) {
            if (title.includes(word)) {
                score += 1;
            }
        });
        if (score > 0) {
            results.set(i, score);
        }
    }
    return results;
}

function search_title_index(words, index) {
    let results = []; // [ Node, ... ]

    words.forEach(function (word) {
        let candidates = index.search(word, get_distance(word));
        results = results.concat(candidates);
    });

    let post_results = new Map; // { post_index: score, ... }
    results.forEach((word_node) => {
        let score = word_node.score;
        word_node.value.forEach((post_index) => {
            if (post_results.has(post_index)) {
                post_results.set(post_index, post_results.get(post_index) + score);
            } else {
                post_results.set(post_index, score);
            }
        });
    });

    return post_results;
}

function search_content_index(words, index) {
    let results = new Map; // { lang: [ Node, ... ], ... }

    for (let lang in index) {
        let tree = index[lang];
        words.forEach(function (word) {
            let candidates = tree.search(word, get_distance(word));
            candidates.forEach(function (candidate) {
                if (results.has(lang)) {
                    results.get(lang).push(candidate);
                } else {
                    results.set(lang, [candidate]);
                }
            });
        });
    }

    // Results is a map of language to an array of Node, where its value is [ post_index, ... ].
    // Group the results per post index and count the number of occurrences and their distances.
    // The indexes refer to the post index in search_index["posts"].

    let post_results = new Map; // { post_index: score, ... }
    results.forEach((results, _lang) => {
        results.forEach((word_node) => {
            let score = word_node.score;
            word_node.value.forEach((post_index) => {
                if (post_results.has(post_index)) {
                    post_results.set(post_index, post_results.get(post_index) + score);
                } else {
                    post_results.set(post_index, score);
                }
            });
        });
    });

    return post_results;
}

class Node {
    constructor(word, value) {
        this.word = word;
        this.value = value;
        this.children = {};
    }
}

class BKTree {
    constructor(distance_func) {
        this.root = null;
        this.distance_func = distance_func;
    }

    add(word, value) {
        if (this.root === null) {
            this.root = new Node(word, value);
        } else {
            let current = this.root;
            while (true) {
                const dist = this.distance_func(word, current.word);
                if (dist in current.children) {
                    current = current.children[dist];
                } else {
                    current.children[dist] = new Node(word, value);
                    break;
                }
            }
        }
    }

    search(word, threshold) {
        if (this.root === null) {
            return [];
        }

        const candidates = [this.root];
        const results = [];

        while (candidates.length > 0) {
            const node = candidates.pop();
            const distance = this.distance_func(word, node.word);
            if (distance <= threshold) {
                let score = 1 - distance / Math.max(word.length, node.word.length);
                results.push({ word: node.word, value: node.value, score: score });
            }

            for (let d = distance - threshold; d <= distance + threshold; d++) {
                if (d in node.children) {
                    candidates.push(node.children[d]);
                }
            }
        }

        return results;
    }
}

function levenshtein_distance(word1, word2) {
    const len1 = word1.length;
    const len2 = word2.length;
    const dp = Array.from({ length: len1 + 1 }, () => Array(len2 + 1).fill(0));

    for (let i = 0; i <= len1; i++) {
        dp[i][0] = i;
    }
    for (let j = 0; j <= len2; j++) {
        dp[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            if (word1[i - 1] === word2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
            }
        }
    }

    return dp[len1][len2];
}