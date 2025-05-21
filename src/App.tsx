import { useState } from 'react'

import './App.css'
import Header from './components/Header'
import ThreePage from './components/ThreePage'
import Projects from './components/Projects'
import Cursor from './Cursor'

function App() {

  return (
    <>
      <Cursor/>
      <Header/>
      <ThreePage/>
      <Projects/>
    </>
  )
}

export default App
