import React from 'react';
import { BrowserRouter, Route, Link } from 'react-router-dom';
import logo from './logo.svg';
import Header from './Components/Header';
import Footer from './Components/Footer';
import HomeView from './Views/HomeView';
import ContactView from './Views/ContactView';
import NewsView from './Views/NewsView';
import NewsDetail from './Views/NewsDetail';
import './App.css';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Header />
      <div className="App">
        <Route exact path='/' component={HomeView} />
        <Route path='/contact' component={ContactView} />
        <Route exact path='/news' component={NewsView} />
        <Route path='/news/:id' component={NewsDetail} />
      </div>
      <Footer />
    </BrowserRouter>
  );
}

export default App;
