;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-beginner-reader.ss" "lang")((modname pset-02-starter_vc) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #t #t none #f () #t)))

(@problem 2)
(@dd-template-rules one-of
                    atomic-distinct
                    atomic-distinct
                    atomic-distinct
                    atomic-distinct)

(define (fn-for-site s)
  (cond [(string=? s "Vancouver") (...)]
        [(string=? s "Okanagan") (...)]
        [(string=? s "Robson") (...)]
        [(string=? s "CDM") (...)]))

(@problem 3)
(@htdf preference?)
(@signature Rating -> Boolean)
(check-expect (preference? "n/a") false)
(check-expect (preference? 3) false)
(check-expect (preference? 1) true)
(check-expect (preference? 5) true)

; (define (preference? r) true) ; stub

(@template-origin Rating)
(@template
 (define (preference? r)
  (cond
    [(and (string? r) (string=? r "n/a")) false]
    [else (not (= r 3))]))
         





 
(@problem 4)
(@htdd Altitude)
;; Altitude is one of:
;;  - "pre-launch"
;;  - Number
;;  - "post-flight"
;; interp. Altitude of rocket. Before launch, in meters above launch
;;         pad, after flight has ended.
;; CONSTRAINT: when a number is > 0
(define A0 "pre-launch")
(define A1 37.5)
(define A2 "post-flight")

(@dd-template-rules one-of
                    atomic-distinct
                    atomic-non-distinct
                    atoic-distinct)

(define (fn-for-altitude a)
  (cond
    [(and (string? a) (string=? a "pre-launch")) (...)]
    [(number? a) (... a)]
    [else (...)]))


(@problem 5)
;;
;; Design a function that consumes an Altitude and produces true
;; if the rocket is actually inflight.  Call the function inflight?
;;
(@htdf inflight?)
(@signature Altitude -> Boolean)
;; produces true if the rocket is actually inflight
(check-expect (inflight? "pre-launch") false)
(check-expect (inflight? "post-flight") false)
(check-expect (inflight? 100) true)

; (define (inflight? a) false) ;stub

(@template-origin Altitude)
(@template
 (define (fn-for-altitude a)
  (cond
    [(and (string? a) (string=? a "pre-launch")) (...)]
    [(number? a) (... a)]
    [else (...)])))

(define (inflight? a)
  (cond
    [(and (string? a) (string=? a "pre-launch")) false]
    [(number? a) true]
    [else false]))