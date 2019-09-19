import React from 'react';
import { BrowserRouter, Route, Link } from 'react-router-dom';
import logo from './logo.svg';
import Header from './Components/Header';
import Footer from './Components/Footer';
import HomeView from './Views/HomeView';
import ContactView from './Views/ContactView';
import NewsView from './Views/NewsView';
import './App.css';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Header />
      <div className="App">
        <Route exact path='/' component={HomeView} />
        <Route path='/contact' component={ContactView} />
        <Route path='/news' component={NewsView} />
      </div>
      <Footer />
    </BrowserRouter>
  );
}

export default App;
