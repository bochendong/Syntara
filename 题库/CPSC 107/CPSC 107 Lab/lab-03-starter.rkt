;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-beginner-reader.ss" "lang")((modname lab-03-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)
(require 2htdp/image)
(require 2htdp/universe)

(@assignment 107/labs/lab-03)
(@cwl ???) 

;; CPSC 107 - Balloon Lab

;; CONSTANTS ==========================

(define WIDTH 500)
(define HEIGHT 500)
(define MTS (empty-scene WIDTH HEIGHT))

(define BALLOON-COLOUR "red")
(define POP-IMAGE (overlay (text "POP!" 20 "black")
                           (radial-star 10 (/ WIDTH 30) (/ WIDTH 10)
                                        "solid"
                                        "yellow")))

(define CTR-X (/ WIDTH 2))
(define CTR-Y (/ HEIGHT 2))

(define SPEED 0.2)

(define MAX-SIZE (/ WIDTH 20))

(@htdw ListOfBalloon)
;; DATA DEFINITIONS ============================

(@problem 1)
;; PRE-LAB/Problem 1: Complete three data definitions according to
;; the following descriptions:
;; 1) State is the state of a balloon, and should either
;;    be "popped" (false) or an integer radius between 0
;;    and MAX-SIZE.
;; 2) Balloon is a single balloon, which should be
;;    represented by an x-coordinate, a y-coordinate,
;;    and a state. NOTE: Design Balloon so that 
;;    (make-balloon 1 2 false) creates a balloon at position
;;    (1, 2) that is "popped" (if you do not do this, you will
;;    receive a lower autograding score).
;; 3) ListOfBalloon is a list of balloons. When creating the
;;    data definition, DO NOT comment out the template or you 
;;    will receive a lower autograding score.

(@htdd State)






(@htdd Balloon)
(define-struct balloon (x y state))





(@htdd ListOfBalloon)







;; FUNCTIONS ====================================

;; ListOfBalloon ->ListOfBalloon
;; starts the world program with an empty list of balloons 
; no examples for main function
(@htdf main)
(@signature ListOfBalloon -> ListOfBalloon)
(@template-origin htdw-main)
(define (main lob)
  (big-bang lob
    (on-tick tick)
    (on-mouse add)
    (to-draw render)))

;; Problem 2: Design a function called tick, which
;; will update the state of all the balloons every time
;; the program's clock ticks. The function will take
;; in a ListOfBalloon and produces a ListOfBalloon where
;; every balloon's radius grows by SPEED or is popped.
(@problem 2)
;(@htdf tick) ;!!! UNCOMMENT this when you start the problem











;; The following function is provided for you. It
;; takes in a ListOfBalloon and adds a balloon
;; to it at the position of a mouse click.
(@htdf add)
(@signature ListOfBalloon -> ListOfBalloon)
;; adds a new balloon to the screen where cursor clicks
(check-expect (add empty 50 50 "button-down")
              (cons (make-balloon 50 50 0) empty))

;(define (add lob x y me) lob) ;stub

(@template-origin MouseEvent)
(define (add lob x y me)
  (if (mouse=? me "button-down")
      (cons (make-balloon x y 0) lob)
      lob))


;; Problem 3: Design a function called render which renders
;; a list of balloons onto the screen. A balloon with a
;; radius can be represented on the screen simple as a
;; circle with the given position and radius. A popped
;; balloon can be represented using the POP-IMAGE constant
;; we provided for you.
(@problem 3)
;(@htdf render) ;!!! UNCOMMENT this when you start the problem








            
