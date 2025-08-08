import type { NextPage } from 'next'
import Head from 'next/head'
import  MinuteForm  from '@/components/MinuteForm'

const Home: NextPage = () => (
  <>
    <Head>
      <title>Minuta Digital</title>
    </Head>
    <MinuteForm />
  </>
)

export default Home
