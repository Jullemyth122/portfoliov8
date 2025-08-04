import { useEffect, useState } from 'react'

import './App.css'
import Header from './components/Header'
import ThreePage from './components/ThreePage'
import Projects from './components/Projects'
import Cursor from './Cursor'
import Contacts from './components/Contacts'
// import Projects from './components/ProjectsOrig'


function App() {


  return (
    <div>
      <Cursor/>
      <Header/>
      <ThreePage/>
      <Projects/>
      <Contacts/>
    </div>
  )
}

export default App
