;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-advanced-reader.ss" "lang")((modname lab-10-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)
(@assignment 107/labs/lab-10)
(@cwl ???)  ;; !!! REPLACE ??? with your cwl to hand this file in

;; CPSC 107 - Maps Lab
(@problem 1)
(@htdd Venue)
(define-struct vnu (nm los))
;; Venue is (make-vnu String (listof Streetway))
;; interp. a venue name and streetways leading from that venue

(@htdd Streetway)
(define-struct sw (nm dst))
;; Streetway is (make-sw String String)
;; interp. (make-sw s v) is a streetway s that leads to the destination venue v.


;; PRELAB: Expand VENUES so that it includes AT LEAST the venues and streetways
;; in the block that spans from Richards to Hamilton, and from Dunsmuir to
;; Hastings (there are 9 venues and 17 streetways in that block). 
(define VENUES
  (list (make-vnu "Shine Night Club"
                  (list (make-sw "Richards Southbound"
                                 "WOW Tasty Food Delivery")
                        (make-sw "Cordova Eastbound"
                                 "Rocket Reprographics")))
        (make-vnu "Rocket Reprographics"
                  (list (make-sw "Cordova Eastbound"
                                 "Anti-Hero 13 Boutique")))
        (make-vnu "Anti-Hero 13 Boutique" (list))
        (make-vnu "WOW Tasty Food Delivery"
                  (list (make-sw "Hastings Eastbound"
                                 "Vancouver Film School")))
        (make-vnu "Vancouver Film School"
                  (list (make-sw "Hastings Westbound"
                                 "WOW Tasty Food Delivery")
                        (make-sw "Homer Northbound"
                                 "Rocket Reprographics")))))

;; Consider this to be a primitive function that comes with the data definitions
;; and that given a venue name it produces the corresponding venue.  Because
;; this consumes a string and generates a venue, calling it will amount to a
;; generative step in a recursion through a graph of venues and streetways.
;; You must not edit this function, but you can experiment with it to see how
;; it works.

(@htdf lookup-venue)
(@signature String -> Venue)
(define (lookup-venue name)
  (local [(define (scan lst)
            (cond [(empty? lst) (error "No venue named " name)]
                  [else
                   (if (string=? (vnu-nm (first lst)) name)
                       (first lst)
                       (scan (rest lst)))]))]
    (scan VENUES)))



;; PRELAB: Complete the data definition by finishing the template for
;; fn-for-venue and fn-for-los in the encapsulated fn-for-map. DO NOT ADD
;; ACCUMULATORS, simply produce the template that corresponds to the type
;; comments.

(@template-origin encapsulated genrec Venue (listof Streetway) Streetway)
(define (fn-for-map v)
  (local [(define (fn-for-venue v)
            (...))
          
          (define (fn-for-los los)
            (...))
          
          (define (fn-for-sw sw)
            (... (sw-nm sw)
                 ;; lookup-venue is the generative step that makes the whole MR
                 ;; generative
                 (fn-for-venue (lookup-venue (sw-dst sw)))))]
    (fn-for-venue v)))



;; Problem 1:

;; Design a function that, given a venue and the name of a venue IN THAT ORDER,
;; produces true if the named venue can be reached from the given venue.
;; Call it can-get-to?.

;(@htdf can-get-to?)





;; Problem 2 (OPTIONAL but strongly recommended as good practice):

;; Design a function, called find-route, that given a venue and the name of
;; some other venue, produces a list of names of streetways that can get you
;; to the named venue (i.e a list of driving directions), or false if the named
;; venue cannot be reached from the given venue.

;; Your find-route design does not need to be tail-recursive. But if you finish
;; early, try refactoring your solution so it is! You may want to keep a copy
;; of your non-tail-recursive solution to hand in.
(@problem 2)
;(@htdf find-route)



