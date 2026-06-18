;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p6-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
;; DO NOT PUT ANYTHING PERSONALLY IDENTIFYING BEYOND YOUR CWL IN THIS FILE.
(require spd/tags)

(@assignment exams/2023w1-f/f-p6) ;Do not edit or remove this tag




(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line
(@problem 5) ;do not edit or delete this line
(@problem 6) ;do not edit or delete this line


#|
 Below are data definitions for a simple graph FROM LECTURE 22.

 REVIEW THEM, AND THEN PROCEED TO THE PROBLEM INSTRUCTIONS BELOW.
|#


;; =================
;; DATA DEFINITIONS: 

(@htdd Node)
(define-struct node (number nexts))
;; Node is (make-node Natural (listof Natural))
;; interp. node's number, and list of numbers of nodes that the arrows point to

(define N101 (make-node 101 (list 102 108 107)))


(@htdd Map)
#|
 A Map is AN OPAQUE DATA STRUCTURE that represents one or more maps.
 OPAQUE means you can't look inside it.  THE ONLY THING YOU ARE  ALLOWED TO DO
 WITH A MAP IS PASS IT TO generate-node.

 generate-node is defined at the bottom of the file. You should treat it as a
 primitive function described as follows:

 generate node
 Map Natural -> Node

 If a node with the given number exists in map then generate and produce it.
 Signal an error if no node with the given number exists in the map.

 The bottom of the file defines a map called MAP for the graphs shown in
 this figure:

   https://cs110.students.cs.ubc.ca/lectures/m11-out-of-order-figure.png
 
 But the functions you design must work for any map.
|#

;;
;; Normal recursion and tail recursion templates for this kind of graph:
;;
#;
(define (fn-for-graph/nr map num0)  
  (local [(define (fn-for-node n)
            (local [(define num (node-number n))
                    (define nexts (node-nexts n))]
              (cond [(...) (...)] ;stop cycles
                    [else
                     (fn-for-lonn nexts)])))
          
          (define (fn-for-lonn lonn)
            (cond [(empty? lonn) (...)]
                  [else
                   (... (first lonn)
                        (fn-for-node (generate-node map (first lonn)))
                        (fn-for-lonn (rest lonn)))]))]
    
    (fn-for-? ...num0))) 

#;
(define (fn-for-graph/tr map num0)
  ;; nn-wl is (listof Natural); node number worklist
  ;; fn-for-node adds the unvisited direct subs of n
  ;; fn-for-lonn takes node numbers off one at a time to call fn-for-node
  (local [(define (fn-for-node n nn-wl)
            (local [(define num (node-number n))
                    (define nexts (node-nexts n))]
              (cond [(...) (...)] ;stop cycles
                    [else
                     (fn-for-lonn (append nexts nn-wl))])))
          
          (define (fn-for-lonn nn-wl visited)
            (cond [(empty? nn-wl) (...)] 
                  [else
                   (fn-for-node (generate-node map (first nn-wl))
                                (rest nn-wl))]))]

    (fn-for-? ...num0)))




;; =================
;; Functions:

(@htdf one-exit-to-only)
(@signature Map Natural -> (listof Natural))
;; Traverse from start; produce numbers of nodes with more than one arrow in
(check-expect (one-exit-to-only MAP   1) (list 1 2 3 4 5 6 8 9))
(check-expect (one-exit-to-only MAP  11) (list 11 13 14 15 16 17 18))
(check-expect (one-exit-to-only MAP 101) (list 101 102 104 105 106 107))

(define (one-exit-to-only map start)
  ;; nn-wl is (listof Natural); worklist of node numbers
  ;; visited is (listof Natural);
  ;; one-only is (listof Natural);
  ;; nums of nodes that are visited only once
  ;; when visiting node NOT IN visited num is added to one-only
  ;; when visiting node     IN visited num is removed from one-only
  (local [(define (fn-for-node n nn-wl visited one-only)
            (local [(define num   (node-number n))
                    (define nexts (node-nexts n))]
              (cond [(member num visited)
                     (fn-for-lonn nn-wl visited (remove num one-only))]
                    [else
                     (fn-for-lonn (append nexts nn-wl)
                                  (cons num visited)
                                  (cons num one-only))])))
          
          (define (fn-for-lonn nn-wl visited one-only)
            (cond [(empty? nn-wl)
                   (reverse one-only)]
                  [else
                   (fn-for-node (generate-node map (first nn-wl))
                                (rest nn-wl)
                                visited
                                one-only)]))]
    
    (fn-for-node (generate-node map start) empty empty empty)))
;;
;; generate-node is a primitive described-above.
;;
;; You should not look at and definitely must not edit this code.
;;


(@htdf generate-node)
(@signature Map Natural -> Node)
;; Give map and node number (name), generate corresponding node
(define (generate-node map number)
  (local [(define entry (assoc number map))]
    (if (false? entry)
        (error "Node with given number does not exist." number)
        (apply make-node entry))))


(define MAP '((1 (2 6)) 
              (2 (3 5))
              (3 (4))
              (4 ())
              (5 ())
              (6 (8))
              (8 (9))
              (9 ())

              (11 (12 15 16))
              (12 (13 14))
              (13 ())
              (14 (12))
              (15 ())
              (16 (17 18))
              (17 ())
              (18 ())

              (101 (102 108 107))
              
              (102 (103))
              (108 (103))
              (107 ())
              
              (103 (104 105))
              
              (104 ())
              (105 (106))
              (106 (108))


              (-1   (-2 -5))
              (-2   (-3 -4))
              (-3   ())
              (-4   ())
              (-5   ())

              (-11  (-12))
              (-12  (-13))
              (-13  (-11))

              (-101 (-102 -103))
              
              (-102 (-104))
              (-103 (-104))
              
              (-104 (-105))              
              (-105 (-106))              
              (-106 (-107 -105))
              (-107 (-105))))
