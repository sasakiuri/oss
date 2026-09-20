import React from "react"
import path from "path"
import { Helmet } from "react-helmet"
import { useStaticQuery, graphql } from "gatsby"
import { ComponentSeoQuery } from "../../types/graphql-types"

type Props = {
  title?: string
  lang?: string
  charSet?: string
  description?: string
  slug?: string
  featuredImage?: string
}

const Component: React.FC<Props> = (props: Props) => {
  const data: ComponentSeoQuery = useStaticQuery<ComponentSeoQuery>(
    graphql`
      query ComponentSeo {
        site {
          siteMetadata {
            title
            siteUrl
            image
            description
            social {
              twitter
              facebookAppId
            }
          }
        }
      }
    `
  )

  const title: string = props.title
    ? `${props.title} : ${data.site.siteMetadata.title}`
    : data.site.siteMetadata.title

  const description: string =
    props.description || data.site.siteMetadata.description

  const url: string = props.slug
    ? `${data.site.siteMetadata.siteUrl}${path.sep}${props.slug}`
    : data.site.siteMetadata.siteUrl

  const twitterSite: string = `@${data.site.siteMetadata.social.twitter}`
  const ogTitle: string = props.title || data.site.siteMetadata.title
  const image: string = props.featuredImage
    ? `${data.site.siteMetadata.siteUrl}${props.featuredImage}`
    : data.site.siteMetadata.image

  return (
    <Helmet>
      <html lang={props.lang} />

      <title>{title}</title>

      <meta charSet={props.charSet} />
      <meta name="description" content={description} />

      <meta name="twitter:card" content="summary" />
      <meta name="twitter:site" content={twitterSite} />
      <meta name="twitter:creator" content={twitterSite} />
      <meta
        name="twitter:image"
        content="https://cdn.nilay.jp/ecommerce/res/40f542fd0fd0bf4b5b60be43e49007bfabc0b9e7.png"
      />

      <meta property="og:url" content={url} />
      <meta property="og:title" content={ogTitle} />
      <meta property="og:description" content={description} />
      <meta
        property="og:image"
        content="https://cdn.nilay.jp/ecommerce/res/e5b2d52de6422d7fa2a1c7c0eede2477e1b4883d.png"
      />

      <meta
        property="fb:app_id"
        content={data.site.siteMetadata.social.facebookAppId}
      />

      <link rel="canonical" href={url} />
    </Helmet>
  )
}

Component.defaultProps = {
  lang: "ja",
  charSet: "UTF-8",
}

export const SEO = Component
