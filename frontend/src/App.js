import React from "react";
import "@/index.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Submit from "./pages/Submit";
import Display from "./pages/Display";
import { LiveMessagesProvider } from "./contexts/LiveMessagesContext";
import { ThemeProvider } from "./contexts/ThemeContext";

function App() {
    return (
        <div className="App">
            <ThemeProvider>
                <LiveMessagesProvider>
                    <BrowserRouter>
                        <Routes>
                            <Route path="/" element={<Submit />} />
                            <Route path="/display" element={<Display />} />
                            <Route
                                path="*"
                                element={<Navigate to="/" replace />}
                            />
                        </Routes>
                    </BrowserRouter>
                </LiveMessagesProvider>
            </ThemeProvider>
        </div>
    );
}

export default App;
