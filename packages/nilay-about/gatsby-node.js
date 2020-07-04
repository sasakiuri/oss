exports.onCreatePage = async ({ page, actions }) => {
  const { createPage } = actions
  if (page.path.match(/^\/news/)) {
    page.matchPath = "/news/*"
    createPage(page)
  }
}
