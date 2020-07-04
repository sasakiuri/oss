/**
 * Configure your Gatsby site with this file.
 *
 * See: https://www.gatsbyjs.org/docs/gatsby-config/
 */

module.exports = {
  siteMetadata: {
    title: `Nilay/About`,
    author: {
      name: `Nilay`,
    },
    description: `Nilay では射撃・狩猟・有害鳥獣駆除に関するサービスを提供しています。少しでも使いやすいサービスにしていきたいと思っておりますのでよろしくお願いいたします。`,
    siteUrl: `https://about.nilay.jp`,
    image: `https://lengstorf.com/images/jason-lengstorf.jpg`,
    social: {
      twitter: `NilayJP`,
      facebook: `NilaySport`,
      facebookAppId: `2162823167069625`,
      youtube: `UC03yJGn_rZV2MTpr-ZrMZrA`,
      instagram: `NilayJP`,
      github: `nilay-jp`,
    },
    phoneNumber: ``,
    emailAddress: ``,
    location: {
      prefecture: `神奈川県`,
      city: `横須賀市`,
      street: `長井3-50-19`,
    },
  },
  plugins: [
    {
      resolve: "gatsby-plugin-graphql-codegen",
      options: {
        fileName: `types/graphql-types.d.ts`,
      },
    },
    `gatsby-plugin-material-ui`,
    `gatsby-plugin-react-helmet`,
    `gatsby-plugin-sharp`,
    `gatsby-plugin-styled-components`,
    `gatsby-plugin-typescript`,
    {
      resolve: `gatsby-source-filesystem`,
      options: {
        path: `${__dirname}/content/assets`,
        name: `assets`,
      },
    },
    `gatsby-transformer-sharp`,
  ],
}
