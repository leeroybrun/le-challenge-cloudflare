async function* consumePages(loader, pageSize = 10) {
  for (let page = 1, didReadAll = false; !didReadAll; page++) {
    // eslint-disable-next-line no-await-in-loop
    const response = await loader({
      per_page: pageSize,
      page
    });

    if (response.success) {
      yield* response.result;
    } else {
      const error = new Error('Cloudflare API error.');
      error.errors = response.errors;
      throw error;
    }

    didReadAll = page >= response.result_info.total_pages;
  }
}

module.exports = consumePages;
