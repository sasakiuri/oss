import React from 'react';
import { BrowserRouter, Route, Link } from 'react-router-dom';
import AppBar from "./component/app-bar/v1/app-bar"
import Footer from "./component/footer/v1/component"
import HomeScene from "./scene/home/v1/container"
import ContactView from './Views/ContactView';
import NewsView from './Views/NewsView';
import NewsDetail from './Views/NewsDetail';
import './App.css';
import { StylesProvider } from '@material-ui/styles';



const App: React.FC = () => {
  return (
    <StylesProvider injectFirst>
      <BrowserRouter>
        <AppBar />
        <div className="App">
          <Route exact path='/' component={HomeScene} />
          <Route path='/contact' component={ContactView} />
          <Route exact path='/news' component={NewsView} />
          <Route path='/news/:id' component={NewsDetail} />
        </div>
        <Footer />
      </BrowserRouter>
    </StylesProvider>
  );
}

export default App;
