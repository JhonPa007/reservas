import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import BookingView from './BookingView';
import PartnerView from './PartnerView';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BookingView />} />
        <Route path="/partner" element={<PartnerView />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
