;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p2-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)
(require 2htdp/image)

(@assignment f-p2)

(@cwl ???)   ;fill in your CWL here (same CWL you put for problem sets)

(@problem 1) ;This is actually problem 2, DO NOT EDIT OR DELETE THIS LINE!

;; PROBLEM
;;
;; Consider the following data definition:
;;        
(@htdd RenderTree)
(define-struct node (above besides))
;; RenderTree is one of:
;; - Image
;; - (make-node RenderTree (listof RenderTree))
;; interp. a tree of images to render, simply, in tree form
(define RT0 (square 20 "solid" "red"))
(define RT1 (circle 20 "solid" "blue"))
(define RT2 (make-node RT0 (list RT0 RT1 RT0)))
(define RT3 (make-node RT2 (list RT1 RT0 RT1)))
(define RT4 (make-node empty-image (list RT2 RT3 RT2)))
(define RT5 (make-node (square 20 "solid" "red") (list)))

;(@template-origin encapsulated RenderTree (listof RenderTree))

(define (fn-for-rt rt0)
  (local [(define (fn-for-rt rt)
            (cond [(image? rt) (... rt)]
                  [else
                   (... (fn-for-rt (node-above rt))
                        (fn-for-lort (node-besides rt)))]))

          (define (fn-for-lort lort)
            (cond [(empty? lort) (...)]
                  [else
                   (... (fn-for-rt (first lort))
                        (fn-for-lort (rest lort)))]))]
    (fn-for-rt rt0)))


;; 
;; Design a function that consumes a RenderTree and produces an image that
;; is a simple rendering of the tree.  The rendering should reflect the
;; structure of the tree.  But keep it SIMPLE.  It doesn't have to look
;; good, it just has to be a rendering of the tree.  Your function must
;; be called render, and you must provide all required recipe elements.
;;

;(@htdf render)  ;uncomment this when you start
