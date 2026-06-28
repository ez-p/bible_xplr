## Overview
Build a Bible verse explorer web application using Next.js that can be deployed on Vercel that takes a bible verse (example John 3:16) or a range of bible verses (John 3:10-22) and explore the Bible verse by referencing major key words in the Bible verse and exploring the meaning of the original Hebrew or Greek words of the major key words in the Bible verse.

## Major theme key words
In all Bible verses certain words can be considered major theme words.  Examples being salvation, lovingkindness, love, friend, waiting, etc. Your job is to understand the Bible verse and discover the major theme words.  These words will be highlighted when displaying the Bible verse.

## ESV API
Bible verses can be retrieved using the ESV API. The url for retrieving Bible verse text is https://api.esv.org/v3/passage/text/ and the ESV_API_TOKEN is provided in .env.local.  Documentation for using the ESV API is at https://api.esv.org/docs/passage-text/ you are to read the documentation and fully understand the ESV API for use in this web application.  Make full use of the ESV API in unique ways in order to provide a rich user experience when exploring Bible verses.

## Bible verse exposition
This is the value add of the web application: When the user clicks on a highlighed majoy key word generate exposition text on the how the word is used in the original language and how the knowledge of the original meaning of the word exponds on the Bible verse. This opens the Bible verse to greater meaning and interpretation by giving the user additional knowledge of the original Bible language and how knowledge of the original language adds to the understanding of the Bible verse.